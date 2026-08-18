-- Phase 0 smoke-test table (docs/proposals/realtime-sync-engine.md §9).
-- A throwaway shape target proving the Postgres → Electric → HTTP pipe works
-- before any real schema lands. Replaced by real migrations in Phase 2.

create table sync_demo_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'demo',
  title text not null,
  done boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into sync_demo_items (title) values
  ('hello from postgres init'),
  ('edit me and watch the shape log');
