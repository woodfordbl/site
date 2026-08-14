# Real-time sync engine — ElectricSQL, accounts, teams, and the blog/workspace split

Status: proposal (August 2026). Covers the full architecture for turning the site into a
multi-user, multi-device real-time workspace: Postgres schema, ElectricSQL sync topology,
TanStack DB integration, auth + teams, ReBAC access control, public publishing, and a
phased migration plan that keeps the blog rendering exactly as it does today.

## 0. Two reality checks before anything else

Research done August 2026 surfaced two facts that reshape the original premise. Neither
is disqualifying, but both change decisions:

1. **PlanetScale has no free tier.** The Hobby plan was removed in April 2024 and never
   reinstated. PlanetScale *for Postgres* (GA September 2025) does officially support
   ElectricSQL — logical replication, failover-aware slots, an official integration doc —
   but the floor is $5/mo (single-node PS-5), with real caveats: no
   `CREATE PUBLICATION ... FOR ALL TABLES`, slots must be failover-enabled,
   `sync_replication_slots = on` required. PlanetScale MySQL (Vitess) is a hard no —
   Electric is Postgres-only.
   - **Recommendation: start on Neon's free plan** (0.5 GB storage, 100 CU-hours/mo,
     logical replication supported, documented Electric integration). Move to PlanetScale
     Postgres later if we outgrow Neon and want their Metal story — the schema and
     Electric config port unchanged. Notably, the Electric team now sits inside
     Databricks/Neon (see next item), so Neon is also the best-aligned host long-term.
   - Neon caveats to respect: use the **direct (unpooled) connection string** for
     Electric; inactive replication slots are reaped after ~75 minutes (fine while
     Electric stays up; a risk during long outages — an alert on slot absence is cheap
     insurance); logical-replication egress counts against the 5 GB/mo transfer cap.

2. **Electric Cloud is winding down.** Electric (the company) joined Databricks on
   August 11, 2026; the hosted cloud is being retired and the team is building sync into
   Neon/Lakebase. The sync engine itself stays Apache-2.0 open source and actively
   maintained (v1.7.11 as of this writing), and self-hosting is a single stateless-ish
   Docker container. **Plan: self-host `electricsql/electric`** on Fly.io or Railway
   (~$5/mo class; it needs a persistent volume for shape logs and a long-lived process —
   Vercel cannot host it). Watch for the Neon-hosted incarnation and adopt it when it
   lands.
   - Hedge: PowerSync ships an official `@tanstack/powersync-db-collection` with
     query-driven sync. Because all client code targets TanStack DB collections (not
     Electric APIs directly), the blast radius of ever swapping sync engines is confined
     to collection configuration and the write-path handlers.

Realistic monthly cost at hobby scale: **$0–5** (Neon free + one small Electric
container; Vercel hosting as today). With PlanetScale instead of Neon: ~$10.

## 1. Goals

- **Real-time everywhere**: every page/block/database edit syncs live across devices and
  users, with optimistic local writes and no spinners.
- **The blog is untouched**: shipped content in `content/pages/**.json` keeps rendering
  exactly as today — build-time bundled, SSR'd, crawlable, zero database on the read
  path.
- **Anyone can sign up** and get their own workspace; workspaces can be personal or
  team-owned; pages can be shared (viewer/editor) and published publicly.
- **ReBAC**: access flows through relationships — workspace membership, team membership,
  page-level grants, and inheritance down the page tree — not static role checks.
- **Keep the local-first feel**: the existing TanStack DB architecture, granular
  transactions, undo/redo, and snapshot machinery survive; sync slots in underneath.
- **Free-tier friendly**: everything runs on free/near-free infrastructure.

## 2. Why ElectricSQL + TanStack DB (and how they compose)

The codebase already made this bet — README says so, and the audit confirms it's a good
one:

- All user data lives in flat, id-keyed TanStack DB collections (`local-pages`,
  `local-blocks`, `local-databases`, `local-database-rows`) with **client-generated
  UUIDs** (`crypto.randomUUID()` everywhere). Offline inserts already produce globally
  unique primary keys — the hardest sync problem is pre-solved.
- Every edit flows through explicit transactions (`block-collection-ops.ts`) with an
  `acceptMutations` seam and `commitAndMarkDirty` at the end — exactly the shape of
  `electricCollectionOptions`' `onInsert/onUpdate/onDelete` write path.
- The connector sync engine (`database-sync-engine.ts`) already implements
  leader-election, apply-diff-into-collection, and persist-meta-after-commit — the same
  patterns an Electric integration needs.

How the pieces fit:

- **Electric** is read-path only: an Elixir service tails Postgres logical replication
  and serves **shapes** (table + where-clause + columns) over plain, CDN-cacheable HTTP
  long-polling/SSE. It does not handle writes, auth, or conflicts.
- **TanStack DB** is the client store: collections + differential-dataflow live queries +
  optimistic mutations. `@tanstack/electric-db-collection` feeds a collection from a
  shape stream and holds each optimistic overlay until the write's Postgres **txid**
  appears in the stream — no flicker, no manual reconciliation.
- **Writes** go through TanStack Start server functions: validate session → authorize
  (ReBAC check) → apply mutation in a Postgres transaction → return
  `pg_current_xact_id()::xid::text` captured **inside that same transaction** (the #1
  documented footgun — capturing it outside stalls the client's `awaitTxId`).
- **TanStack Query stays** for what it does today (shipped-content loaders, connector
  APIs). TanStack DB extends Query rather than replacing it; `queryCollectionOptions`
  and `electricCollectionOptions` collections coexist and join in live queries.

Sync modes matter for scale: pages/blocks shapes use eager sync (small per-workspace);
`database_rows` uses **progressive / query-driven sync** (TanStack DB 0.5+) so live-query
predicates translate into Electric subset requests and we never bulk-sync giant tables.

## 3. Target topology

```
                    ┌────────────────────────────── Vercel ──────────────────────────────┐
Browser             │  TanStack Start (SSR + server functions + API routes)              │
┌─────────────┐     │                                                                    │
│ TanStack DB │──── │──► /api/sync/:table   auth proxy → injects where/params/secret ──┐ │
│ collections │     │    /api/mutate        write path → Postgres tx → returns txid ─┐ │ │
│ (electric + │     │    Better Auth routes (/api/auth/*)                            │ │ │
│  local)     │     └────────────────────────────────────────────────────────────────┼─┼─┘
└─────────────┘                                                                      │ │
      ▲                 ┌──────────────────────┐        ┌───────────────────────┐    │ │
      └── shape logs ── │  Electric sync svc   │ ◄──────│  Postgres (Neon free) │ ◄──┘ │
          (HTTP/SSE)    │  (Fly.io container,  │  WAL   │  app + auth + ReBAC   │      │
                        │   persistent volume) │        │  tables together      │ ◄────┘
                        └──────────────────────┘        └───────────────────────┘
```

- The **proxy** is a TanStack Start API route (`routes/api/` already hosts Nitro
  handlers). It validates the Better Auth session cookie, resolves the requested
  logical shape (`pages`, `blocks`, …) to a concrete Electric shape with a
  **server-injected where clause** (`workspace_id = $1`, membership subquery, etc.),
  passes through only the Electric protocol params (`offset`, `handle`, `live`,
  `live_sse`, `replica`, `log` — exported as `ELECTRIC_PROTOCOL_QUERY_PARAMS`), attaches
  the `ELECTRIC_SECRET` server-side, and strips `content-encoding`/`content-length` from
  responses. Clients can never widen a shape: Electric ANDs any client subset filter
  with the proxy's where clause, and `queryable_columns` allow-lists what subsets may
  reference.
- Electric needs a direct (unpooled) Postgres connection with `wal_level=logical` and a
  `REPLICATION`-capable role. App/write-path queries can use the pooled string.
- Later, a CDN in front of the proxy (with `Vary: Cookie`) collapses concurrent
  long-polls; not needed at hobby scale.

## 4. Postgres schema

Auth tables (Better Auth) and app tables live in **one database** so that auth state,
permission tuples, and content mutate in single ACID transactions, and so membership
tables can participate in Electric shape subqueries.

### 4.1 Auth & tenancy (Better Auth owns these)

Better Auth + **organization plugin** (`teams: { enabled: true }`) + admin plugin,
via the Drizzle adapter:

- `user`, `session`, `account`, `verification` — core auth. Email/password + GitHub and
  Google OAuth to start.
- `organization`, `member` (userId, organizationId, role: owner/admin/member),
  `invitation`, `team`, `team_member` — orgs are **workspaces** (see mapping below).
  Invitations (email-based, 48h expiry) and org roles come free; `organizationHooks`
  (before/after member add/remove, team changes) are where ReBAC maintenance hooks in.
- The admin plugin gives the site owner user listing/search, bans, and impersonation
  for support.

**Tenancy mapping**: one Better Auth `organization` per workspace. A personal workspace
is an organization with one owner-member, auto-created at signup. This avoids inventing
a parallel workspace concept: `member` *is* workspace membership, `team` *is* the team
layer for larger orgs, and `session.activeOrganizationId` *is* the current-workspace
switcher.

### 4.2 Content tables

Direct ports of the existing zod schemas (`local-page.ts`, `block.ts`, `database.ts`),
which were designed for this. Every table carries a denormalized `workspace_id` — the
single most important schema decision, because Electric shapes are single-table and
`workspace_id = $1` is an **optimized** where clause (indexed shape evaluation, ~5k row
changes/sec regardless of shape count).

```sql
create table pages (
  id            uuid primary key,            -- client-generated
  workspace_id  text not null references organization(id),
  slug          text not null,
  title         text not null default '',
  icon          jsonb,
  parent_id     uuid references pages(id),
  sidebar_order double precision,            -- existing sparse ordering
  settings      jsonb not null default '{}', -- font, fullWidth, headerImage, textScale
  database_source     jsonb,                 -- {databaseId} | null
  database_row_source jsonb,                 -- {databaseId, rowId} | null
  is_public     boolean not null default false,   -- published to the world
  public_slug   text unique,                 -- pretty URL for published pages
  created_by    text not null references "user"(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,                 -- soft delete / trash
  unique (workspace_id, slug)
);

create table blocks (
  id            uuid primary key,
  workspace_id  text not null,               -- denormalized for shapes
  page_id       uuid not null references pages(id) on delete cascade,
  parent_id     uuid,                        -- block tree within the page (flat list + parentId, as today)
  type          text not null,
  fractional_index text not null,            -- NEW — replaces the page-level blockOrder array
  indent        smallint,
  props         jsonb not null default '{}', -- per-type props incl. text + inline marks
  color         text, background_color text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);
create index on blocks (page_id, fractional_index);

create table databases (
  id            uuid primary key,
  workspace_id  text not null,
  name          text not null,
  icon          jsonb,
  primary_field_id text not null,
  fields        jsonb not null default '[]', -- embedded, as today (see §8 friction)
  views         jsonb not null default '[]',
  row_defaults  jsonb, source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table database_rows (
  id            uuid primary key,
  workspace_id  text not null,
  database_id   uuid not null references databases(id) on delete cascade,
  icon          jsonb,
  values        jsonb not null default '{}', -- Record<fieldId, CellValue>, sparse
  "order"       double precision,
  page_id       uuid,
  external_id   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on database_rows (database_id);
```

Two deliberate changes from the local model:

- **`blockOrder` array → per-block `fractional_index`.** The page-level array is the one
  part of the current model that cannot survive multi-user editing: two users inserting
  blocks on the same page would fight over a single row. Fractional (midpoint) keys make
  insert/move a single-block write. The codebase already uses sparse numeric ordering
  with midpoint-plus-renumber math for `sidebarOrder` and `row.order`
  (`database-collection-ops.ts`), so the pattern is familiar; use a proper
  lexicographic implementation (e.g. the `fractional-indexing` package) to avoid float
  exhaustion. The ordering invariant ("blockOrder and block rows commit together")
  dissolves — ordering becomes a property of each block row.
- **Timestamps become `timestamptz` set server-side** (`updated_at` via trigger).
  Client `updatedAt` remains advisory; the server clock is the LWW tiebreaker.

### 4.3 ReBAC tables

External authorization engines (OpenFGA, SpiceDB, Permit) were evaluated and rejected
for this app: they introduce the dual-write consistency problem (app DB and authz DB
disagreeing mid-failure) and — decisively — **they cannot drive Electric shape
filtering**, because shape where-clauses evaluate against Postgres rows only. Authorization
must *be data in Postgres* to participate in sync. In-Postgres ReBAC gives us Zanzibar
semantics with single-transaction consistency:

```sql
-- Explicit grants, only where sharing is configured (Notion-style):
create table page_permissions (
  page_id      uuid not null references pages(id) on delete cascade,
  subject_type text not null check (subject_type in ('user','team','org','public')),
  subject_id   text not null default '',    -- '' for public
  role         text not null check (role in ('viewer','commenter','editor','owner')),
  granted_by   text, granted_at timestamptz default now(),
  primary key (page_id, subject_type, subject_id)
);

-- Closure table: every (page, ancestor) pair, trigger-maintained on parent_id changes.
create table page_ancestors (
  page_id     uuid not null references pages(id) on delete cascade,
  ancestor_id uuid not null references pages(id) on delete cascade,
  depth       int  not null,
  primary key (page_id, ancestor_id)
);

-- Flat, sync-facing projection: "which pages can this user see, at what level".
create table user_page_access (
  user_id  text not null,
  page_id  uuid not null references pages(id) on delete cascade,
  workspace_id text not null,
  role     text not null,          -- max() of all granting paths
  primary key (user_id, page_id)
);
```

**Semantics** (mirrors Notion's model — the `parent_id` chain is *the* permission
inheritance path, distinct from render structure):

- Workspace members get baseline access to all non-restricted workspace pages via their
  `member.role` (owner/admin → editor-everything; member → configurable default).
- A `page_permissions` grant on a page applies to its entire subtree via
  `page_ancestors`.
- Effective role = `max(workspace baseline, grants on self and all ancestors, team
  grants expanded through team_member, public)`.

**Enforcement is two-layered:**

1. **Write path (source of truth)**: a `can_edit_page(user_id, page_id)` SQL function
   using a recursive CTE (or the closure table) — checked inside every mutation
   transaction. Milliseconds at Notion-like tree depths.
2. **Sync path (projection)**: `user_page_access`, maintained by triggers on
   `page_permissions` (grant/revoke), `pages.parent_id` (move → closure delta →
   recompute affected subtree), `member` / `team_member` (join/leave → recompute that
   user × workspace). At hobby scale synchronous trigger recomputation of the affected
   (user, subtree) slice is fine; LISTEN/NOTIFY + a worker is the escape hatch if a
   large org × deep tree ever makes fan-out slow. Write amplification on "share
   workspace root with N members" is the known hot spot — acceptable, bounded, and the
   same trade Zanzibar makes with its denormalized index.

Better Auth's `organizationHooks` (member added/removed, team changed) call the same
recompute functions, keeping auth events and access rows in one transaction.

## 5. Shapes: what each client syncs

All shape requests go through the auth proxy; the client never sees Electric directly or
chooses its own where clause. Per active workspace:

| Logical shape | Table | Server-injected where | Sync mode |
|---|---|---|---|
| `my-access` | `user_page_access` | `user_id = $me` | eager (tiny) |
| `pages` | `pages` | `workspace_id = $ws AND id IN (select page_id from user_page_access where user_id = $me)` — or plain `workspace_id = $ws` for full members | eager |
| `blocks` | `blocks` | same page-set filter | eager per workspace; later per-page-tree on-demand |
| `databases` | `databases` | `workspace_id = $ws` | eager |
| `database-rows` | `database_rows` | `workspace_id = $ws` | **progressive** (query-driven subsets; `queryable_columns: [database_id]`) |
| `members` | `member`+`user` projection (a view or narrow columns) | `organization_id = $ws` | eager — powers presence/sharing UI |

Notes:

- Where-clause **subqueries** (`id IN (SELECT ...)`) are supported and incrementally
  maintained as of 2026 — membership changes move rows in/out of shapes without a
  resync. Keep filters to equality/IN forms; those are the optimized classes.
- Shape definitions are immutable; switching workspace = subscribing to a different
  shape (cheap). Schema migrations on a synced table invalidate its shapes → clients
  transparently refetch; plan migrations on `blocks` accordingly (narrow per-workspace
  shapes keep refetches small).
- Electric does not guarantee cross-shape transactional atomicity (pages vs blocks
  arrive independently). The UI already tolerates this (blocks render under whatever
  page metadata exists), and the txid mechanism ensures each client's *own* writes
  appear atomically in its optimistic layer.

## 6. Client integration

The strategy is **swap the storage engine under the existing ops layer, per mode**:

- `src/db/collections/` gains a factory: given a mode (`local` | `synced`), produce the
  seven collections either from `localStorageCollectionOptions` (today's code, kept
  verbatim for anonymous/local use) or `electricCollectionOptions` (signed-in). The
  hot-collection HMR machinery and collection ids stay.
- `block-collection-ops.ts`, `database-collection-ops.ts`, the canvas reducer, sessions,
  undo/redo, snapshots — all unchanged. They already speak "granular ops in a
  transaction against collections."
- The Electric collections' `onInsert/onUpdate/onDelete` call one Start server function
  `mutate(workspaceId, mutations[])` that: loads the session, runs `can_edit_page` /
  database checks, applies all mutations in one Postgres transaction, captures
  `pg_current_xact_id()::xid::text`, returns `{ txid }`. TanStack DB matches the txid in
  the shape stream and drops the optimistic overlay.
- **Ordering**: block ops compute `fractional_index` values instead of splicing
  `blockOrder`. The in-memory `CanvasPageSession` keeps its ordered array — it's derived
  by sorting on `fractional_index` — so render code doesn't change.
- **Conflicts**: block-granular LWW via server `updated_at`. The existing three-way
  merge (`merge-page-blocks.ts`) stays for its current job (shipped-baseline vs local);
  concurrent live editing conflicts at block granularity resolve by last write, which is
  the right MVP semantics. Character-level merge inside a block (two users in the same
  paragraph) is explicitly out of scope for v1 — the offset-based inline-marks
  representation is hostile to it; if/when it matters, adopt Yjs *per text block*
  (`@electric-sql/y-electric` exists for exactly this hybrid) rather than CRDTifying the
  whole model.
- **Offline**: TanStack DB 0.6 persistence (SQLite/IndexedDB-backed collections) gives
  synced collections a local cache across reloads; optimistic mutations queue while
  offline. Electric handles reconnect/catch-up via offsets. The existing
  snapshot/timeline machinery keeps working as a safety net.
- Presence (cursors, avatars) is not Electric's job; add later via a tiny WebSocket
  room (the Finnhub crossws handler is a template) or a service like PartyKit.

## 7. The split: blog vs. workspace, one codebase, two domains

Today the site is "shipped content + a single anonymous local overlay." Target:

**Modes** (resolved per-request/per-session):

1. **Blog visitor (anonymous, on blakewoodford.com)** — exactly today's experience:
   shipped JSON renders SSR from the build-time bundle; local playground edits go to
   localStorage collections; no accounts, no database on the read path. Zero regression
   risk because the code path is unchanged.
2. **Signed-in user (workspace app)** — Electric-backed collections scoped to their
   active workspace; the sidebar lists their workspaces/pages; the owner's blog content
   is not in their tenant.
3. **Public published page (workspace content)** — any workspace page with
   `is_public = true` gets a public route, SSR'd from Postgres (a Start server function
   reading the page + blocks, reusing `CanvasBlocksReadOnly`), cache-headered and
   crawlable. This is "publish to web," separate from the file-based blog.

**Deployment**: one codebase, two Vercel projects on the same repo, differing only in a
`SITE_MODE` env var (`blog` | `app`) and domain:

- `blakewoodford.com` → mode `blog`: routes = shipped content + local playground +
  marketing/signup entry point. Auth routes can exist here too (cookies are per-domain).
- `<app-domain>.com` → mode `app`: routes = auth, workspaces, published-page renderer;
  the blog catch-all is disabled. Same build, one flag.

This is cheaper to operate than host-based branching in one deployment and keeps blog
uptime decoupled from app experiments. (A single-project host-routing setup remains
possible later — nothing in the code needs to know more than `SITE_MODE`.)

The blog itself could eventually *become* a published workspace (the owner's workspace
with `is_public` pages, file-content imported once), but that is explicitly **not** in
scope: the file-based pipeline is good, free, and SEO-proven. Revisit only after the
workspace product is stable.

## 8. Known friction points (called out, not hand-waved)

- **`database.fields[]` / `views[]` are embedded arrays** — two users editing different
  columns of one database collide on one row (LWW on the whole document). Acceptable for
  v1 (rare collision, low stakes); the fix, if needed, is normalizing fields/views into
  child tables — the schemas were built via `.omit()` derivation and split cleanly.
- **Inline marks are offset ranges over plain strings** — fine under block-level LWW,
  wrong under concurrent same-block editing. Deferred (see §6 conflicts).
- **Formula evaluation stays client-side** (read-time overlay over synced rows) — no
  change, formulas never persist values, so sync carries only inputs.
- **`site-local-dirty` / `site-page-list-local` cookie machinery** exists only because
  localStorage is invisible to SSR. For signed-in users the server *has* the data, so
  the workspace app SSRs real content and the cookie layer is bypassed; it survives
  untouched for the anonymous blog mode.
- **Neon slot reaping / WAL retention**: monitor `pg_replication_slots` and Electric's
  health endpoint; a dead slot means every client gets `must-refetch` (correct but
  expensive). Keep shapes narrow so refetches stay cheap.
- **TanStack DB is pre-1.0** (0.7.x): APIs churn. Pin versions, wrap
  `electricCollectionOptions` usage in one factory module so upgrades touch one file.
  (The repo already pins and already ships `@tanstack/db` in production.)

## 9. Phased plan

Each phase ships independently and leaves the blog untouched.

**Phase 0 — Infrastructure spike (a weekend)**
Neon project + `wal_level` check; Electric container on Fly with a volume; one throwaway
table; a Start API route proxying a shape; a demo page rendering a live query. Proves
the pipe end-to-end before any schema work.

**Phase 1 — Auth + tenancy**
Drizzle + Better Auth (organization plugin with teams, admin plugin) on Neon; signup,
OAuth, personal-workspace auto-create, invitations, workspace switcher UI;
`SITE_MODE` flag and the second Vercel project. No content sync yet — signed-in users
still get local collections.

**Phase 2 — Content schema + write path**
Migrations for `pages/blocks/databases/database_rows` (with `workspace_id`,
`fractional_index`); the `mutate` server function with txid capture; ReBAC tables +
closure/access triggers + `can_edit_page`; unit tests against a local Postgres
(Electric's fractional-index + trigger logic is the highest-value test surface).

**Phase 3 — Sync integration**
Collection factory (`local` vs `synced`); shape proxy routes with per-shape where
injection; port `block-collection-ops` ordering to fractional indexes; txid-matched
optimistic writes; cross-device demo. Milestone: **two browsers, one page, live edits**.

**Phase 4 — Sharing + publishing**
Share dialog (user/team grants, roles), public publishing (`is_public` + `public_slug`),
SSR'd public page route with `CanvasBlocksReadOnly`, workspace member management UI,
trash/restore via `deleted_at`.

**Phase 5 — Hardening + scale affordances**
TanStack DB persistence for offline cache; progressive sync for `database_rows`;
`queryable_columns` allow-lists; monitoring (slot health, WAL retention, shape counts);
optionally CDN in front of the proxy; optionally presence.

## 10. Decision summary

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Database | **Neon free tier** (→ PlanetScale Postgres if outgrown) | PlanetScale (no free tier), Supabase (IPv6 direct-conn + pause-on-idle on free) |
| Sync engine | **Self-hosted Electric** (Fly.io/Railway) | Electric Cloud (winding down), Zero (abandons TanStack DB stack), PowerSync (kept as hedge), Convex/Jazz (abandon Postgres) |
| Client store | **TanStack DB electric collections** under existing ops layer | Rewriting the data layer (unnecessary — it was built for this) |
| Auth | **Better Auth** + organization/teams + admin plugins, same Postgres | Clerk/WorkOS (identity outside our DB → dual-store sync), Auth.js (maintenance mode) |
| Tenancy | Better Auth `organization` = workspace | Parallel custom workspace tables |
| ReBAC | **In-Postgres**: grants + closure table + flat `user_page_access` projection, recursive-CTE write checks | OpenFGA/SpiceDB/Permit (dual-write problem; can't filter Electric shapes) |
| Ordering | **Fractional index per block** | Keeping the page-level `blockOrder` array (multi-user contention) |
| Text collaboration | Block-level LWW now; per-block Yjs later if needed | Whole-model CRDT |
| Blog/app split | One codebase, `SITE_MODE` flag, two Vercel projects/domains | Migrating the blog into the database (unnecessary risk) |
