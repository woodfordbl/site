-- Better Auth 1.6's organization plugin writes createdAt on invitations;
-- the initial hand-rolled schema missed it.
alter table "invitation"
  add column if not exists "createdAt" timestamptz not null default now();
