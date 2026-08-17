-- Workspace-scoped content keys: the primary key of every content table
-- becomes (workspace_id, id), and every table that references a page is
-- rekeyed to match.
--
-- Why content ids are workspace-scoped: shipped page content
-- (content/pages/*.json) carries FIXED ids — the home page's id is literally
-- 'home', and the other shipped pages, blocks and databases carry hard-coded
-- uuids. Every signed-in workspace seeds its own overlay copy of that content,
-- so the same id legitimately exists once per workspace: a content id names a
-- document WITHIN a workspace, never across the installation. Under the old
-- global `id primary key` only the first workspace that ever seeded could own
-- those ids — every later workspace's seed insert hit
-- `on conflict (id) do update ... where workspace_id = $2`, matched zero rows,
-- and (once ReBAC landed) was rejected with a 403 because can_access()
-- resolved the id to a page owned by a different workspace.
--
-- Invariants established here:
-- * (workspace_id, id) is the identity of a pages/blocks/databases/
--   database_rows row. `id` alone identifies nothing.
-- * page_permissions, page_ancestors and user_page_access each carry
--   workspace_id and key/reference pages by (workspace_id, id), so no row can
--   describe a page in another workspace. A page's ancestors are always in the
--   page's own workspace.
-- * Every permission function takes the workspace explicitly. Resolving a page
--   by id alone is an ACCESS-CONTROL fault, not just a lookup fault: with ids
--   shared across workspaces, one workspace's grants would otherwise decide
--   another workspace's answer.
-- * ON DELETE CASCADE is preserved end to end — deleting a workspace still
--   clears its pages and everything derived from them, deleting a page still
--   clears its grants/closure/projection rows, deleting a user still clears
--   their grants and projection rows.
-- * A page's workspace_id is immutable while it exists: its own
--   (page, page, 0) closure row references it through both composite foreign
--   keys, so an UPDATE of pages.workspace_id is rejected instead of silently
--   stranding the page's blocks, grants and closure in the old workspace.

-- ── 1. drop the foreign keys onto pages (id) ────────────────────────────────

alter table page_permissions drop constraint page_permissions_page_id_fkey;
alter table page_ancestors drop constraint page_ancestors_page_id_fkey;
alter table page_ancestors drop constraint page_ancestors_ancestor_id_fkey;
alter table user_page_access drop constraint user_page_access_page_id_fkey;

-- ── 2. content tables: primary key becomes (workspace_id, id) ───────────────
-- No standalone index on `id` is created: after this migration every server
-- query, function and foreign key addresses content rows by the full
-- (workspace_id, id) pair, which the new primary key already serves.

alter table pages drop constraint pages_pkey;
alter table pages add primary key (workspace_id, id);

alter table blocks drop constraint blocks_pkey;
alter table blocks add primary key (workspace_id, id);

alter table databases drop constraint databases_pkey;
alter table databases add primary key (workspace_id, id);

alter table database_rows drop constraint database_rows_pkey;
alter table database_rows add primary key (workspace_id, id);

-- ── 3. page_permissions: workspace-scoped grants ────────────────────────────
-- The backfill is exact: it runs while page ids are still globally unique, so
-- every grant resolves to exactly one page. A grant that survived with a NULL
-- workspace would mean the dropped foreign key had already been violated —
-- the SET NOT NULL below fails loudly rather than guessing.

alter table page_permissions add column workspace_id text;

update page_permissions pp
set workspace_id = p.workspace_id
from pages p
where p.id = pp.page_id;

alter table page_permissions alter column workspace_id set not null;

alter table page_permissions drop constraint page_permissions_pkey;
alter table page_permissions
  add primary key (workspace_id, page_id, subject_type, subject_id);
alter table page_permissions
  add constraint page_permissions_page_fkey
  foreign key (workspace_id, page_id) references pages (workspace_id, id)
  on delete cascade;

-- ── 4. page_ancestors: workspace-scoped closure ─────────────────────────────
-- Chains that crossed a workspace boundary only ever existed because ids were
-- global (a page seeded into workspace B whose parentId resolved to workspace
-- A's copy). They are not representable under the composite key, so they are
-- deleted; the workspaces they touched are remembered so section 7 can
-- re-derive their projection with the corrected chains.

alter table page_ancestors add column workspace_id text;

update page_ancestors pa
set workspace_id = p.workspace_id
from pages p
where p.id = pa.page_id;

alter table page_ancestors alter column workspace_id set not null;

create temp table _rekey_repair_ws on commit drop as
select distinct pa.workspace_id as ws
from page_ancestors pa
where not exists (
  select 1 from pages a
  where a.id = pa.ancestor_id and a.workspace_id = pa.workspace_id
);

delete from page_ancestors pa
where not exists (
  select 1 from pages a
  where a.id = pa.ancestor_id and a.workspace_id = pa.workspace_id
);

alter table page_ancestors drop constraint page_ancestors_pkey;
alter table page_ancestors add primary key (workspace_id, page_id, ancestor_id);
alter table page_ancestors
  add constraint page_ancestors_page_fkey
  foreign key (workspace_id, page_id) references pages (workspace_id, id)
  on delete cascade;
alter table page_ancestors
  add constraint page_ancestors_ancestor_fkey
  foreign key (workspace_id, ancestor_id) references pages (workspace_id, id)
  on delete cascade;

-- Subtree lookups (rebac_subtree) and the ancestor-side cascade both address
-- the closure by (workspace_id, ancestor_id) now.
drop index page_ancestors_anc_idx;
create index page_ancestors_anc_idx
  on page_ancestors (workspace_id, ancestor_id);

-- ── 5. user_page_access: workspace-scoped projection ────────────────────────
-- workspace_id was already present and always copied from the page, so the
-- new key needs no backfill. The (workspace_id, user_id) index the shape host
-- reads on every snapshot and live poll is left untouched.

alter table user_page_access drop constraint user_page_access_pkey;
alter table user_page_access add primary key (user_id, workspace_id, page_id);
alter table user_page_access
  add constraint user_page_access_page_fkey
  foreign key (workspace_id, page_id) references pages (workspace_id, id)
  on delete cascade;

-- ── 6. permission functions: workspace is an explicit argument ──────────────
-- Every function that used to resolve a page by id alone now takes the
-- workspace and scopes each pages/page_ancestors/page_permissions lookup by
-- (workspace_id, id). The old signatures are dropped so no caller can reach
-- the unscoped behavior.

drop function if exists can_access(text, text, text);
drop function if exists effective_level(text, text);
drop function if exists rebac_subtree(text);
drop function if exists rebac_rebuild_ancestors(text);
drop function if exists rebac_recompute_access(text[], text[]);
drop function if exists rebac_group_pages(uuid);

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

-- The page's subtree (descendants + self) within its workspace.
create or replace function rebac_subtree(p_ws text, p_page text) returns text[]
language sql stable as $$
  select coalesce(array_agg(page_id), '{}')
  from page_ancestors where workspace_id = p_ws and ancestor_id = p_page
$$;

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

-- pages: INSERT/DELETE and permission-relevant UPDATEs fan out to the
-- workspace's users × the page's subtree. Content-only doc updates return
-- without touching the projection. A workspace change is no longer one of the
-- cases to handle: the page's own closure row pins pages.workspace_id through
-- both composite foreign keys, so such an UPDATE is rejected outright.
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

-- ── 7. re-derive the workspaces whose closure section 4 corrected ───────────

do $$
declare
  v_ws text;
begin
  for v_ws in select ws from _rekey_repair_ws loop
    perform rebac_recompute_access(
      v_ws, rebac_ws_users(v_ws), rebac_ws_pages(v_ws));
  end loop;
end;
$$;
