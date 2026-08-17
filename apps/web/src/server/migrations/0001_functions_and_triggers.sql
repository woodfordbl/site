-- Functions and triggers: the part of the schema Drizzle cannot express.
-- Applies after 0000_baseline.sql, which creates every table these attach to.
--
-- Two ordering facts are load-bearing:
-- * Same-event triggers fire in NAME order, so `pages_rebac_1_closure` must
--   sort before `pages_rebac_2_project`: the projection reads page_ancestors
--   and would recompute against a stale closure otherwise.
-- * `rebac_grant_users` takes the `page_permissions` composite row type, so it
--   cannot be created before that table exists.

-- ── shape log ───────────────────────────────────────────────────────────────
-- Append-only per-workspace change feed. Content triggers log the whole `doc`
-- (null on delete); the access trigger logs the affected user inside `doc`, so
-- the shape host can filter entries to the requesting user.

create or replace function log_shape_change() returns trigger as $$
declare
  target record;
begin
  if tg_op = 'DELETE' then
    target := old;
  else
    target := new;
  end if;
  insert into shape_log (tbl, workspace_id, row_id, op, txid, doc)
  values (
    tg_table_name,
    target.workspace_id,
    target.id,
    lower(tg_op),
    (pg_current_xact_id()::xid::text)::bigint,
    case when tg_op = 'DELETE' then null else target.doc end
  );
  perform pg_notify('shape_log', target.workspace_id);
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint

create or replace function log_access_change() returns trigger as $$
declare
  target user_page_access;
begin
  if tg_op = 'DELETE' then
    target := old;
  else
    target := new;
  end if;
  insert into shape_log (tbl, workspace_id, row_id, op, txid, doc)
  values (
    'user_page_access',
    target.workspace_id,
    target.page_id,
    lower(tg_op),
    (pg_current_xact_id()::xid::text)::bigint,
    case when tg_op = 'DELETE'
      then jsonb_build_object('userId', target.user_id, 'pageId', target.page_id)
      else jsonb_build_object(
        'userId', target.user_id, 'pageId', target.page_id, 'level', target.level)
    end
  );
  perform pg_notify('shape_log', target.workspace_id);
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;
--> statement-breakpoint

-- ── level ordering ──────────────────────────────────────────────────────────

-- Capability-level ordering: view < comment < edit < full_access.
-- Unknown/null input ranks 0 (below every real level).
create or replace function page_level_rank(p_level text) returns int
language sql immutable as $$
  select case p_level
    when 'view' then 1
    when 'comment' then 2
    when 'edit' then 3
    when 'full_access' then 4
    else 0
  end
$$;
--> statement-breakpoint

-- ── effective permission ────────────────────────────────────────────────────

-- Chain = ancestors of the page (self included) within p_ws, truncated at the
-- nearest ancestor (inclusive) with inherit_permissions=false. Candidates =
-- explicit grants on chain nodes (direct user, via group, or workspace-wide
-- for non-guest members) plus the role baseline (owner/admin→full_access,
-- member→edit) when the page is workspace-visible and the chain reached the
-- root unbroken. Returns the max candidate, or null for no access.
create or replace function effective_level(p_user text, p_ws text, p_page text)
returns text
language sql stable as $$
  with target as (
    select workspace_id, visibility from pages
    where workspace_id = p_ws and id = p_page
  ),
  chain_all as (
    select pa.ancestor_id, pa.depth, anc.inherit_permissions
    from page_ancestors pa
    join pages anc
      on anc.workspace_id = pa.workspace_id and anc.id = pa.ancestor_id
    where pa.workspace_id = p_ws and pa.page_id = p_page
  ),
  cutoff as (
    select min(depth) as depth from chain_all where not inherit_permissions
  ),
  chain as (
    select ancestor_id from chain_all
    where depth <= coalesce((select depth from cutoff), 2147483647)
  ),
  baseline as (
    select case
      when exists (
        select 1 from member m join target t on t.workspace_id = m."organizationId"
        where m."userId" = p_user and m.role in ('owner', 'admin')
      ) then 'full_access'
      when exists (
        select 1 from member m join target t on t.workspace_id = m."organizationId"
        where m."userId" = p_user and m.role = 'member'
      ) then 'edit'
    end as level
  ),
  candidates as (
    select pp.level
    from page_permissions pp
    join chain c on c.ancestor_id = pp.page_id
    where pp.workspace_id = p_ws
      and ((pp.subject_type = 'user' and pp.subject_id = p_user)
        or (pp.subject_type = 'group' and exists (
              select 1 from group_members gm
              where gm.user_id = p_user and gm.group_id::text = pp.subject_id))
        or (pp.subject_type = 'workspace' and exists (
              select 1 from member m join target t on t.workspace_id = m."organizationId"
              where m."userId" = p_user and m.role <> 'guest')))
    union all
    select b.level
    from baseline b, target t
    where b.level is not null
      and t.visibility = 'workspace'
      and (select depth from cutoff) is null
  )
  select level from candidates
  order by page_level_rank(level) desc
  limit 1
$$;
--> statement-breakpoint

-- True when the user's effective level on (p_ws, p_page) meets or exceeds
-- p_level. Unknown p_level values are rejected (false), never treated as
-- level 0; a page id belonging to another workspace resolves to no access.
create or replace function can_access(
  p_user text, p_ws text, p_page text, p_level text
) returns boolean
language sql stable as $$
  select page_level_rank(p_level) > 0
     and page_level_rank(effective_level(p_user, p_ws, p_page))
         >= page_level_rank(p_level)
$$;
--> statement-breakpoint

-- ── closure maintenance ─────────────────────────────────────────────────────

-- Rebuilds the ancestor rows for p_page's whole subtree after a parent
-- change: walks the new chain upward from pages.parent_id within p_ws
-- (raising on a cycle, stopping at a missing parent), drops the subtree's
-- links to nodes outside the subtree, and re-links every subtree node to the
-- new chain. Rows internal to the subtree are untouched — they stay valid
-- across moves. A parent id that names a page in another workspace is a
-- dangling id here, exactly like one that names no page at all.
create or replace function rebac_rebuild_ancestors(p_ws text, p_page text)
returns void
language plpgsql as $$
declare
  v_node text;
  v_chain text[] := '{}';
begin
  insert into page_ancestors (workspace_id, page_id, ancestor_id, depth)
  values (p_ws, p_page, p_page, 0)
  on conflict do nothing;

  select parent_id into v_node from pages
  where workspace_id = p_ws and id = p_page;
  while v_node is not null loop
    if v_node = p_page or v_node = any (v_chain) then
      raise exception 'page % cannot be moved under its own descendant (cycle at %)',
        p_page, v_node
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from pages where workspace_id = p_ws and id = v_node
    ) then
      exit; -- dangling parent id: the chain ends at the last real page
    end if;
    v_chain := v_chain || v_node;
    select parent_id into v_node from pages
    where workspace_id = p_ws and id = v_node;
  end loop;

  delete from page_ancestors pa
  where pa.workspace_id = p_ws
    and pa.page_id in (
      select page_id from page_ancestors
      where workspace_id = p_ws and ancestor_id = p_page)
    and pa.ancestor_id not in (
      select page_id from page_ancestors
      where workspace_id = p_ws and ancestor_id = p_page);

  insert into page_ancestors (workspace_id, page_id, ancestor_id, depth)
  select p_ws, sub.page_id, c.ancestor_id, sub.depth + c.ord
  from page_ancestors sub
  cross join unnest(v_chain) with ordinality as c (ancestor_id, ord)
  where sub.workspace_id = p_ws and sub.ancestor_id = p_page
  on conflict (workspace_id, page_id, ancestor_id)
    do update set depth = excluded.depth;
end;
$$;
--> statement-breakpoint

-- Keeps page_ancestors true to pages.parent_id. On INSERT it also adopts any
-- children created before their parent existed (out-of-order sync batches);
-- on DELETE it re-roots the orphaned children (FK cascade already removed
-- every row touching the deleted page). Children are looked up within the
-- page's own workspace: a same-id page in another workspace is unrelated.
create or replace function rebac_pages_closure() returns trigger
language plpgsql as $$
declare
  child record;
begin
  if tg_op = 'INSERT' then
    perform rebac_rebuild_ancestors(new.workspace_id, new.id);
    for child in
      select id from pages
      where workspace_id = new.workspace_id
        and parent_id = new.id and id <> new.id
    loop
      perform rebac_rebuild_ancestors(new.workspace_id, child.id);
    end loop;
  elsif tg_op = 'UPDATE' then
    if old.parent_id is distinct from new.parent_id then
      perform rebac_rebuild_ancestors(new.workspace_id, new.id);
    end if;
  else
    for child in
      select id from pages
      where workspace_id = old.workspace_id and parent_id = old.id
    loop
      perform rebac_rebuild_ancestors(old.workspace_id, child.id);
    end loop;
  end if;
  return null;
end;
$$;
--> statement-breakpoint

-- ── projection recompute ────────────────────────────────────────────────────

-- All distinct member user ids of a workspace (guests included — their rows
-- come solely from explicit grants, which effective_level handles).
create or replace function rebac_ws_users(p_ws text) returns text[]
language sql stable as $$
  select coalesce(array_agg(distinct "userId"), '{}')
  from member where "organizationId" = p_ws
$$;
--> statement-breakpoint

-- All page ids in a workspace.
create or replace function rebac_ws_pages(p_ws text) returns text[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from pages where workspace_id = p_ws
$$;
--> statement-breakpoint

-- The page's subtree (descendants + self) within its workspace.
create or replace function rebac_subtree(p_ws text, p_page text) returns text[]
language sql stable as $$
  select coalesce(array_agg(page_id), '{}')
  from page_ancestors where workspace_id = p_ws and ancestor_id = p_page
$$;
--> statement-breakpoint

-- Users affected by one page_permissions row: the user itself, the group's
-- members, or (for workspace grants) every member of the grant's workspace.
-- 'public' rows affect no signed-in projection rows.
create or replace function rebac_grant_users(pp page_permissions) returns text[]
language sql stable as $$
  select case pp.subject_type
    when 'user' then array[pp.subject_id]
    when 'group' then (
      select coalesce(array_agg(user_id), '{}') from group_members
      where group_id::text = pp.subject_id)
    when 'workspace' then rebac_ws_users(pp.workspace_id)
    else '{}'::text[]
  end
$$;
--> statement-breakpoint

-- Recomputes the (p_users × p_pages) slice of workspace p_ws's
-- user_page_access: drops the rows that lost access and upserts the rest,
-- touching only genuine transitions so shape_log carries no churn.
create or replace function rebac_recompute_access(
  p_ws text, p_users text[], p_pages text[]
) returns void
language plpgsql as $$
begin
  if p_ws is null or p_users is null or p_pages is null
     or cardinality(p_users) = 0 or cardinality(p_pages) = 0 then
    return;
  end if;
  delete from user_page_access a
  where a.workspace_id = p_ws
    and a.user_id = any (p_users) and a.page_id = any (p_pages)
    and effective_level(a.user_id, a.workspace_id, a.page_id) is null;
  insert into user_page_access (user_id, page_id, workspace_id, level)
  select u.user_id, p.id, p.workspace_id, e.level
  from (select distinct unnest(p_users) as user_id) u
  cross join pages p
  cross join lateral (
    select effective_level(u.user_id, p.workspace_id, p.id) as level) e
  where p.workspace_id = p_ws and p.id = any (p_pages) and e.level is not null
  on conflict (user_id, workspace_id, page_id) do update
    set level = excluded.level
    where user_page_access.level is distinct from excluded.level;
end;
$$;
--> statement-breakpoint

-- Recomputes one user's access across every workspace in which the group
-- holds a grant. The workspace comes from the grant rows rather than the
-- groups table, so a cascading group deletion still re-derives correctly.
create or replace function rebac_recompute_group_user(
  p_group uuid, p_user text
) returns void
language plpgsql as $$
declare
  scope record;
begin
  for scope in
    select pp.workspace_id as ws,
           coalesce(array_agg(distinct pa.page_id), '{}') as pages
    from page_permissions pp
    join page_ancestors pa
      on pa.workspace_id = pp.workspace_id and pa.ancestor_id = pp.page_id
    where pp.subject_type = 'group' and pp.subject_id = p_group::text
    group by pp.workspace_id
  loop
    perform rebac_recompute_access(scope.ws, array[p_user], scope.pages);
  end loop;
end;
$$;
--> statement-breakpoint

-- pages: INSERT/DELETE and permission-relevant UPDATEs fan out to the
-- workspace's users × the page's subtree. Content-only doc updates return
-- without touching the projection. A workspace change is not one of the cases
-- to handle: the page's own closure row pins pages.workspace_id through both
-- composite foreign keys, so such an UPDATE is rejected outright.
create or replace function rebac_pages_project() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform rebac_recompute_access(
      new.workspace_id,
      rebac_ws_users(new.workspace_id),
      rebac_subtree(new.workspace_id, new.id));
  elsif tg_op = 'UPDATE' then
    if old.parent_id is distinct from new.parent_id
       or old.visibility is distinct from new.visibility
       or old.inherit_permissions is distinct from new.inherit_permissions then
      perform rebac_recompute_access(
        new.workspace_id,
        rebac_ws_users(new.workspace_id),
        rebac_subtree(new.workspace_id, new.id));
    end if;
  else
    -- The page's own projection rows cascade away with it; re-derive the
    -- re-rooted children subtrees (rebuilt by rebac_pages_closure above).
    perform rebac_recompute_access(
      old.workspace_id,
      rebac_ws_users(old.workspace_id),
      (select coalesce(array_agg(distinct pa.page_id), '{}')
       from pages c
       join page_ancestors pa
         on pa.workspace_id = c.workspace_id and pa.ancestor_id = c.id
       where c.workspace_id = old.workspace_id and c.parent_id = old.id));
  end if;
  return null;
end;
$$;
--> statement-breakpoint

-- page_permissions: recompute the affected subjects × the page's subtree.
create or replace function rebac_permissions_project() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform rebac_recompute_access(
      old.workspace_id,
      rebac_grant_users(old),
      rebac_subtree(old.workspace_id, old.page_id));
    return null;
  end if;
  perform rebac_recompute_access(
    new.workspace_id,
    rebac_grant_users(new),
    rebac_subtree(new.workspace_id, new.page_id));
  if tg_op = 'UPDATE'
     and (old.workspace_id, old.page_id, old.subject_type, old.subject_id)
         is distinct from
         (new.workspace_id, new.page_id, new.subject_type, new.subject_id) then
    perform rebac_recompute_access(
      old.workspace_id,
      rebac_grant_users(old),
      rebac_subtree(old.workspace_id, old.page_id));
  end if;
  return null;
end;
$$;
--> statement-breakpoint

-- member: recompute that user × every page in the workspace.
create or replace function rebac_member_project() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform rebac_recompute_access(
      new."organizationId",
      array[new."userId"],
      rebac_ws_pages(new."organizationId"));
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (old."userId", old."organizationId")
             is distinct from (new."userId", new."organizationId")) then
    perform rebac_recompute_access(
      old."organizationId",
      array[old."userId"],
      rebac_ws_pages(old."organizationId"));
  end if;
  return null;
end;
$$;
--> statement-breakpoint

-- group_members: recompute that user × the pages reachable from the group's
-- grants, per workspace those grants live in.
create or replace function rebac_group_members_project() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform rebac_recompute_group_user(new.group_id, new.user_id);
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (old.user_id, old.group_id) is distinct from (new.user_id, new.group_id)) then
    perform rebac_recompute_group_user(old.group_id, old.user_id);
  end if;
  return null;
end;
$$;
--> statement-breakpoint

-- ── triggers ────────────────────────────────────────────────────────────────
-- The `1_`/`2_` prefixes on the pages triggers are the firing order: Postgres
-- fires same-event triggers alphabetically, and the projection reads the
-- closure the first one rebuilds.

create or replace trigger pages_shape_log
  after insert or update or delete on pages
  for each row execute function log_shape_change();
--> statement-breakpoint
create or replace trigger pages_touch
  before update on pages
  for each row execute function touch_updated_at();
--> statement-breakpoint
create or replace trigger blocks_shape_log
  after insert or update or delete on blocks
  for each row execute function log_shape_change();
--> statement-breakpoint
create or replace trigger blocks_touch
  before update on blocks
  for each row execute function touch_updated_at();
--> statement-breakpoint
create or replace trigger databases_shape_log
  after insert or update or delete on databases
  for each row execute function log_shape_change();
--> statement-breakpoint
create or replace trigger databases_touch
  before update on databases
  for each row execute function touch_updated_at();
--> statement-breakpoint
create or replace trigger database_rows_shape_log
  after insert or update or delete on database_rows
  for each row execute function log_shape_change();
--> statement-breakpoint
create or replace trigger database_rows_touch
  before update on database_rows
  for each row execute function touch_updated_at();
--> statement-breakpoint

create or replace trigger pages_rebac_1_closure
  after insert or update or delete on pages
  for each row execute function rebac_pages_closure();
--> statement-breakpoint
create or replace trigger pages_rebac_2_project
  after insert or update or delete on pages
  for each row execute function rebac_pages_project();
--> statement-breakpoint
create or replace trigger page_permissions_rebac_project
  after insert or update or delete on page_permissions
  for each row execute function rebac_permissions_project();
--> statement-breakpoint
create or replace trigger member_rebac_project
  after insert or update or delete on "member"
  for each row execute function rebac_member_project();
--> statement-breakpoint
create or replace trigger group_members_rebac_project
  after insert or update or delete on group_members
  for each row execute function rebac_group_members_project();
--> statement-breakpoint
create or replace trigger user_page_access_shape_log
  after insert or update or delete on user_page_access
  for each row execute function log_access_change();
