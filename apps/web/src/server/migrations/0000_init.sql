-- Initial sync-engine schema: Better Auth (accounts + organizations), workspace
-- content tables, and the shape log that feeds the dev shape host.
-- See docs/proposals/realtime-sync-engine.md.

-- ── Better Auth core ─────────────────────────────────────────────────────────

create table if not exists "user" (
  "id" text primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null default false,
  "image" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "session" (
  "id" text primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade,
  "activeOrganizationId" text
);
create index if not exists session_user_idx on "session" ("userId");

create table if not exists "account" (
  "id" text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists account_user_idx on "account" ("userId");

create table if not exists "verification" (
  "id" text primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ── Better Auth organization plugin ──────────────────────────────────────────

create table if not exists "organization" (
  "id" text primary key,
  "name" text not null,
  "slug" text not null unique,
  "logo" text,
  "createdAt" timestamptz not null default now(),
  "metadata" text
);

create table if not exists "member" (
  "id" text primary key,
  "organizationId" text not null references "organization" ("id") on delete cascade,
  "userId" text not null references "user" ("id") on delete cascade,
  "role" text not null default 'member',
  "createdAt" timestamptz not null default now()
);
create index if not exists member_org_idx on "member" ("organizationId");
create index if not exists member_user_idx on "member" ("userId");

create table if not exists "invitation" (
  "id" text primary key,
  "organizationId" text not null references "organization" ("id") on delete cascade,
  "email" text not null,
  "role" text,
  "status" text not null default 'pending',
  "expiresAt" timestamptz not null,
  "inviterId" text not null references "user" ("id") on delete cascade
);
create index if not exists invitation_org_idx on "invitation" ("organizationId");
create index if not exists invitation_email_idx on "invitation" ("email");

-- ── Workspace content ────────────────────────────────────────────────────────
-- `doc` mirrors the client-side zod document (localPageSchema / localBlockSchema
-- / localDatabaseSchema / localDatabaseRowSchema) verbatim, so the TanStack DB
-- collections sync whole documents with no mapping layer. Columns outside `doc`
-- exist for indexing, scoping, and server-side bookkeeping only.

create table if not exists pages (
  id uuid primary key,
  workspace_id text not null references "organization" ("id") on delete cascade,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pages_ws_idx on pages (workspace_id);

create table if not exists blocks (
  id uuid primary key,
  workspace_id text not null references "organization" ("id") on delete cascade,
  page_id uuid not null,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blocks_ws_idx on blocks (workspace_id);
create index if not exists blocks_page_idx on blocks (page_id);

create table if not exists databases (
  id uuid primary key,
  workspace_id text not null references "organization" ("id") on delete cascade,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists databases_ws_idx on databases (workspace_id);

create table if not exists database_rows (
  id uuid primary key,
  workspace_id text not null references "organization" ("id") on delete cascade,
  database_id uuid not null,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists database_rows_ws_idx on database_rows (workspace_id);
create index if not exists database_rows_db_idx on database_rows (database_id);

-- ── Shape log (dev shape host) ───────────────────────────────────────────────
-- Append-only change log per workspace, fed by triggers on the content tables.
-- The dev shape host serves this over Electric's HTTP shape protocol; real
-- Electric replaces it by reading logical replication directly (the triggers
-- and this table are then unused, not in the way).

create table if not exists shape_log (
  id bigserial primary key,
  tbl text not null,
  workspace_id text not null,
  row_id uuid not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  txid bigint not null,
  doc jsonb,
  created_at timestamptz not null default now()
);
create index if not exists shape_log_ws_idx on shape_log (workspace_id, id);

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

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array['pages', 'blocks', 'databases', 'database_rows'] loop
    execute format(
      'create or replace trigger %I after insert or update or delete on %I
         for each row execute function log_shape_change()',
      t || '_shape_log', t
    );
    execute format(
      'create or replace trigger %I before update on %I
         for each row execute function touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end;
$$;
