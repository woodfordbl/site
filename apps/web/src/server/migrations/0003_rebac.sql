-- ReBAC step 1: permission columns on pages, groups, page_permissions, the
-- page_ancestors closure table, the can_access/effective_level check
-- functions, and the user_page_access materialized projection with its
-- synchronous recompute triggers. Spec: docs/proposals/
-- workspace-platform-architecture.md §2.2, §2.4, §4.
--
-- Notes:
-- * pages.parent_id is a STORED generated column over doc->>'parentId' (the
--   client doc owns the field). Generated columns cannot appear in
--   UPDATE OF trigger lists, so the pages triggers fire on every UPDATE and
--   compare OLD/NEW inside the body.
-- * user_page_access is NOT yet wired into shape_log/SYNCED_TABLES; a later
--   step exposes it as a shape.
-- * The workspace "default member level" setting does not exist yet; the
--   member baseline is the spec's default, 'edit'.

-- ── pages: permission-model columns ─────────────────────────────────────────

alter table pages
  add column if not exists parent_id text
    generated always as (doc ->> 'parentId') stored,
  add column if not exists visibility text not null default 'workspace'
    check (visibility in ('workspace', 'private')),
  add column if not exists inherit_permissions boolean not null default true;
create index if not exists pages_parent_idx on pages (parent_id);

-- ── groups (share-dialog subjects) ──────────────────────────────────────────

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references "organization" ("id") on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists groups_ws_idx on groups (workspace_id);

create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members (user_id);

-- ── page_permissions (explicit grants) ──────────────────────────────────────

create table if not exists page_permissions (
  page_id text not null references pages (id) on delete cascade,
  subject_type text not null
    check (subject_type in ('user', 'group', 'workspace', 'public')),
  subject_id text not null default '',
  level text not null
    check (level in ('full_access', 'edit', 'comment', 'view')),
  granted_by text references "user" ("id") on delete set null,
  granted_at timestamptz not null default now(),
  primary key (page_id, subject_type, subject_id)
);
create index if not exists page_permissions_subject_idx
  on page_permissions (subject_type, subject_id);

-- ── page_ancestors (closure table, trigger-maintained) ──────────────────────
-- Stores the full physical parent chain including the (page, page, 0) self
-- row. Permission truncation at inherit_permissions=false happens at read
-- time in effective_level(), not here.

create table if not exists page_ancestors (
  page_id text not null references pages (id) on delete cascade,
  ancestor_id text not null references pages (id) on delete cascade,
  depth int not null,
  primary key (page_id, ancestor_id)
);
create index if not exists page_ancestors_anc_idx on page_ancestors (ancestor_id);

-- ── user_page_access (materialized sync projection) ─────────────────────────

create table if not exists user_page_access (
  user_id text not null references "user" ("id") on delete cascade,
  page_id text not null references pages (id) on delete cascade,
  workspace_id text not null references "organization" ("id") on delete cascade,
  level text not null
    check (level in ('full_access', 'edit', 'comment', 'view')),
  primary key (user_id, page_id)
);
create index if not exists user_page_access_ws_user_idx
  on user_page_access (workspace_id, user_id);

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

-- ── effective permission (§4.3) ─────────────────────────────────────────────
-- Chain = ancestors of the page (self included), truncated at the nearest
-- ancestor (inclusive) with inherit_permissions=false. Candidates = explicit
-- grants on chain nodes (direct user, via group, or workspace-wide for
-- non-guest members) plus the role baseline (owner/admin→full_access,
-- member→edit) when the page is workspace-visible and the chain reached the
-- root unbroken. Returns the max candidate, or null for no access.
create or replace function effective_level(p_user text, p_page text)
returns text
language sql stable as $$
  with target as (
    select workspace_id, visibility from pages where id = p_page
  ),
  chain_all as (
    select pa.ancestor_id, pa.depth, anc.inherit_permissions
    from page_ancestors pa
    join pages anc on anc.id = pa.ancestor_id
    where pa.page_id = p_page
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
    where (pp.subject_type = 'user' and pp.subject_id = p_user)
       or (pp.subject_type = 'group' and exists (
             select 1 from group_members gm
             where gm.user_id = p_user and gm.group_id::text = pp.subject_id))
       or (pp.subject_type = 'workspace' and exists (
             select 1 from member m join target t on t.workspace_id = m."organizationId"
             where m."userId" = p_user and m.role <> 'guest'))
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

-- True when the user's effective level on the page meets or exceeds p_level.
-- Unknown p_level values are rejected (false), never treated as level 0.
create or replace function can_access(p_user text, p_page text, p_level text)
returns boolean
language sql stable as $$
  select page_level_rank(p_level) > 0
     and page_level_rank(effective_level(p_user, p_page)) >= page_level_rank(p_level)
$$;

-- ── closure maintenance ─────────────────────────────────────────────────────

-- Rebuilds the ancestor rows for p_page's whole subtree after a parent
-- change: walks the new chain upward from pages.parent_id (raising on a
-- cycle, stopping at a missing parent), drops the subtree's links to nodes
-- outside the subtree, and re-links every subtree node to the new chain.
-- Rows internal to the subtree are untouched — they stay valid across moves.
create or replace function rebac_rebuild_ancestors(p_page text) returns void
language plpgsql as $$
declare
  v_node text;
  v_chain text[] := '{}';
begin
  insert into page_ancestors (page_id, ancestor_id, depth)
  values (p_page, p_page, 0)
  on conflict do nothing;

  select parent_id into v_node from pages where id = p_page;
  while v_node is not null loop
    if v_node = p_page or v_node = any (v_chain) then
      raise exception 'page % cannot be moved under its own descendant (cycle at %)',
        p_page, v_node
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from pages where id = v_node) then
      exit; -- dangling parent id: the chain ends at the last real page
    end if;
    v_chain := v_chain || v_node;
    select parent_id into v_node from pages where id = v_node;
  end loop;

  delete from page_ancestors pa
  where pa.page_id in (select page_id from page_ancestors where ancestor_id = p_page)
    and pa.ancestor_id not in (select page_id from page_ancestors where ancestor_id = p_page);

  insert into page_ancestors (page_id, ancestor_id, depth)
  select sub.page_id, c.ancestor_id, sub.depth + c.ord
  from page_ancestors sub
  cross join unnest(v_chain) with ordinality as c (ancestor_id, ord)
  where sub.ancestor_id = p_page
  on conflict (page_id, ancestor_id) do update set depth = excluded.depth;
end;
$$;

-- Keeps page_ancestors true to pages.parent_id. On INSERT it also adopts any
-- children created before their parent existed (out-of-order sync batches);
-- on DELETE it re-roots the orphaned children (FK cascade already removed
-- every row touching the deleted page).
create or replace function rebac_pages_closure() returns trigger
language plpgsql as $$
declare
  child record;
begin
  if tg_op = 'INSERT' then
    perform rebac_rebuild_ancestors(new.id);
    for child in select id from pages where parent_id = new.id and id <> new.id loop
      perform rebac_rebuild_ancestors(child.id);
    end loop;
  elsif tg_op = 'UPDATE' then
    if old.parent_id is distinct from new.parent_id then
      perform rebac_rebuild_ancestors(new.id);
    end if;
  else
    for child in select id from pages where parent_id = old.id loop
      perform rebac_rebuild_ancestors(child.id);
    end loop;
  end if;
  return null;
end;
$$;

-- ── projection recompute ────────────────────────────────────────────────────

-- All distinct member user ids of a workspace (guests included — their rows
-- come solely from explicit grants, which effective_level handles).
create or replace function rebac_ws_users(p_ws text) returns text[]
language sql stable as $$
  select coalesce(array_agg(distinct "userId"), '{}')
  from member where "organizationId" = p_ws
$$;

-- All page ids in a workspace.
create or replace function rebac_ws_pages(p_ws text) returns text[]
language sql stable as $$
  select coalesce(array_agg(id), '{}') from pages where workspace_id = p_ws
$$;

-- The page's subtree (descendants + self) via the closure table.
create or replace function rebac_subtree(p_page text) returns text[]
language sql stable as $$
  select coalesce(array_agg(page_id), '{}')
  from page_ancestors where ancestor_id = p_page
$$;

-- Every page whose chain can carry a grant to this group: the subtrees of
-- all pages holding a grant for the group.
create or replace function rebac_group_pages(p_group uuid) returns text[]
language sql stable as $$
  select coalesce(array_agg(distinct pa.page_id), '{}')
  from page_permissions pp
  join page_ancestors pa on pa.ancestor_id = pp.page_id
  where pp.subject_type = 'group' and pp.subject_id = p_group::text
$$;

-- Users affected by one page_permissions row: the user itself, the group's
-- members, or (for workspace grants) every member of the page's workspace.
-- 'public' rows affect no signed-in projection rows.
create or replace function rebac_grant_users(pp page_permissions) returns text[]
language sql stable as $$
  select case pp.subject_type
    when 'user' then array[pp.subject_id]
    when 'group' then (
      select coalesce(array_agg(user_id), '{}') from group_members
      where group_id::text = pp.subject_id)
    when 'workspace' then (
      select rebac_ws_users(p.workspace_id) from pages p where p.id = pp.page_id)
    else '{}'::text[]
  end
$$;

-- Recomputes the (p_users × p_pages) slice of user_page_access: deletes the
-- slice, then re-inserts one row per pair whose effective_level is non-null.
create or replace function rebac_recompute_access(p_users text[], p_pages text[])
returns void
language plpgsql as $$
begin
  if p_users is null or p_pages is null
     or cardinality(p_users) = 0 or cardinality(p_pages) = 0 then
    return;
  end if;
  delete from user_page_access
  where user_id = any (p_users) and page_id = any (p_pages);
  insert into user_page_access (user_id, page_id, workspace_id, level)
  select u.user_id, p.id, p.workspace_id, e.level
  from (select distinct unnest(p_users) as user_id) u
  cross join pages p
  cross join lateral (select effective_level(u.user_id, p.id) as level) e
  where p.id = any (p_pages) and e.level is not null
  on conflict (user_id, page_id) do update
    set workspace_id = excluded.workspace_id, level = excluded.level;
end;
$$;

-- pages: INSERT/DELETE and permission-relevant UPDATEs fan out to the
-- workspace's users × the page's subtree. Content-only doc updates return
-- without touching the projection.
create or replace function rebac_pages_project() returns trigger
language plpgsql as $$
declare
  v_users text[];
begin
  if tg_op = 'INSERT' then
    perform rebac_recompute_access(rebac_ws_users(new.workspace_id), rebac_subtree(new.id));
  elsif tg_op = 'UPDATE' then
    if old.parent_id is distinct from new.parent_id
       or old.visibility is distinct from new.visibility
       or old.inherit_permissions is distinct from new.inherit_permissions
       or old.workspace_id is distinct from new.workspace_id then
      v_users := rebac_ws_users(new.workspace_id);
      if old.workspace_id is distinct from new.workspace_id then
        v_users := v_users || rebac_ws_users(old.workspace_id);
      end if;
      perform rebac_recompute_access(v_users, rebac_subtree(new.id));
    end if;
  else
    -- The page's own projection rows cascade away with it; re-derive the
    -- re-rooted children subtrees (rebuilt by rebac_pages_closure above).
    perform rebac_recompute_access(
      rebac_ws_users(old.workspace_id),
      (select coalesce(array_agg(distinct pa.page_id), '{}')
       from pages c
       join page_ancestors pa on pa.ancestor_id = c.id
       where c.parent_id = old.id));
  end if;
  return null;
end;
$$;

-- page_permissions: recompute the affected subjects × the page's subtree.
create or replace function rebac_permissions_project() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform rebac_recompute_access(rebac_grant_users(new), rebac_subtree(new.page_id));
  elsif tg_op = 'DELETE' then
    perform rebac_recompute_access(rebac_grant_users(old), rebac_subtree(old.page_id));
  else
    perform rebac_recompute_access(rebac_grant_users(new), rebac_subtree(new.page_id));
    if (old.page_id, old.subject_type, old.subject_id)
       is distinct from (new.page_id, new.subject_type, new.subject_id) then
      perform rebac_recompute_access(rebac_grant_users(old), rebac_subtree(old.page_id));
    end if;
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
      array[new."userId"], rebac_ws_pages(new."organizationId"));
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (old."userId", old."organizationId")
             is distinct from (new."userId", new."organizationId")) then
    perform rebac_recompute_access(
      array[old."userId"], rebac_ws_pages(old."organizationId"));
  end if;
  return null;
end;
$$;

-- group_members: recompute that user × the pages reachable from the group's
-- grants.
create or replace function rebac_group_members_project() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform rebac_recompute_access(
      array[new.user_id], rebac_group_pages(new.group_id));
  end if;
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (old.user_id, old.group_id) is distinct from (new.user_id, new.group_id)) then
    perform rebac_recompute_access(
      array[old.user_id], rebac_group_pages(old.group_id));
  end if;
  return null;
end;
$$;

-- ── triggers ────────────────────────────────────────────────────────────────
-- Same-event triggers fire in name order: the closure rebuild
-- (pages_rebac_1_*) must run before the projection recompute
-- (pages_rebac_2_*), which reads page_ancestors.

create or replace trigger pages_rebac_1_closure
  after insert or update or delete on pages
  for each row execute function rebac_pages_closure();

create or replace trigger pages_rebac_2_project
  after insert or update or delete on pages
  for each row execute function rebac_pages_project();

create or replace trigger page_permissions_rebac_project
  after insert or update or delete on page_permissions
  for each row execute function rebac_permissions_project();

create or replace trigger member_rebac_project
  after insert or update or delete on "member"
  for each row execute function rebac_member_project();

create or replace trigger group_members_rebac_project
  after insert or update or delete on group_members
  for each row execute function rebac_group_members_project();

-- ── backfill ────────────────────────────────────────────────────────────────

insert into page_ancestors (page_id, ancestor_id, depth)
select id, id, 0 from pages
on conflict do nothing;

with recursive chain as (
  select p.id as page_id, p.parent_id as ancestor_id, 1 as depth,
         array[p.id] as seen
  from pages p
  where p.parent_id is not null
  union all
  select c.page_id, p.parent_id, c.depth + 1, c.seen || p.id
  from chain c
  join pages p on p.id = c.ancestor_id
  where p.parent_id is not null
    and not (p.parent_id = any (c.seen || p.id))
)
insert into page_ancestors (page_id, ancestor_id, depth)
select c.page_id, c.ancestor_id, c.depth
from chain c
where exists (select 1 from pages a where a.id = c.ancestor_id)
on conflict do nothing;

insert into user_page_access (user_id, page_id, workspace_id, level)
select s.user_id, p.id, p.workspace_id, e.level
from (
  select distinct m."userId" as user_id, m."organizationId" as workspace_id
  from member m
  union
  select distinct pp.subject_id, gp.workspace_id
  from page_permissions pp
  join pages gp on gp.id = pp.page_id
  where pp.subject_type = 'user'
  union
  select distinct gm.user_id, gp.workspace_id
  from page_permissions pp
  join pages gp on gp.id = pp.page_id
  join group_members gm on gm.group_id::text = pp.subject_id
  where pp.subject_type = 'group'
) s
join pages p on p.workspace_id = s.workspace_id
cross join lateral (select effective_level(s.user_id, p.id) as level) e
where e.level is not null
on conflict (user_id, page_id) do update
  set workspace_id = excluded.workspace_id, level = excluded.level;
