# Workspace platform architecture — the canonical plan

Status: proposal (August 2026), pending sign-off on the open decisions in §10.
This is the definitive architecture for the multi-user workspace platform. It
supersedes the implementation shortcuts in the working prototype (PR #146) and
absorbs the decisions from [realtime-sync-engine.md](./realtime-sync-engine.md)
(sync topology) and [file-mirror.md](./file-mirror.md) (markdown/CSV replica),
which remain the deep references for those subsystems.

The prototype proved the pipes end-to-end (accounts → workspaces → invitations
→ live two-browser editing over the Electric protocol). This document is the
carefully-architected version: what gets rebuilt deliberately, what survives,
and the full model for identity, permissions, routes, user lifecycle, and the
desktop client.

## 1. System overview

Three planes, one Postgres:

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│  TanStack Start app                                                     │
│  ┌────────────┐  ┌───────────────────────────────┐  ┌───────────────┐  │
│  │ Blog mode  │  │ Workspace mode                │  │ Public mode   │  │
│  │ (anon)     │  │ (signed in, active workspace) │  │ (published)   │  │
│  │ shipped    │  │ Electric collections          │  │ SSR read-only │  │
│  │ SSR + local│  │ + optimistic writes           │  │               │  │
│  └────────────┘  └───────────────────────────────┘  └───────────────┘  │
└───────────┬──────────────────┬───────────────────────────┬─────────────┘
            │                  │ reads: shape protocol     │
   build-time JSON             │ writes: mutate txns       │ SSR fetch
            ▼                  ▼                           ▼
┌──────────────────────────── Server (Start/Nitro) ───────────────────────┐
│  AUTH PLANE          SYNC PLANE                DATA PLANE               │
│  Better Auth         /api/sync/shape (authz    Drizzle schema,         │
│  (email, orgs,       proxy + filter injection) migrations, ReBAC       │
│  invites, sessions)  /api/sync/mutate (authz   functions & triggers    │
│                      + txid capture)                                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
                     Postgres (wal_level=logical)
          dev: shape_log + triggers │ prod: Electric reads WAL directly
```

**Invariants** (proven by the prototype, kept as law):

1. Anonymous visitors get today's blog byte-for-byte. The mode fork happens
   once, at boot, from the `site-workspace` cookie.
2. The client speaks only the real Electric protocol (`@electric-sql/client` +
   electric collections). The dev shape host and production Electric are
   interchangeable behind `/api/sync/shape`.
3. Every acknowledged write's txid must appear on every involved shape stream
   (the zero-row → synthetic-delete rule).
4. Client mutations are serialized per session; the server applies each batch
   in one transaction.
5. All authorization *data* lives in Postgres rows — never an external
   service — so it can both gate writes and filter shapes (see §4.6).

## 2. Database schema (Drizzle as source of truth)

`src/server/schema.ts` is canonical; `drizzle-kit generate` emits migrations;
trigger/function DDL lives in custom migration files alongside. Better Auth
runs on `drizzleAdapter` with CLI-generated auth tables. Rationale: both real
schema bugs in the prototype (missing `invitation.createdAt`, uuid-vs-text
ids) were hand-rolled-DDL bugs that schema-as-code eliminates structurally.
Postgres-isms that don't belong in a query builder (per-key jsonb patch,
`pg_current_xact_id()`, LISTEN/NOTIFY, trigger DDL) stay as `` sql`…` ``
templates inside the typed layer, not as a separate raw layer.

### 2.1 Identity & tenancy (Better Auth–owned, generated)

```
user          id · name · email(uq) · emailVerified · image · createdAt · updatedAt
session       id · userId → user · token(uq) · expiresAt · ipAddress · userAgent
              · activeOrganizationId          ← the "current workspace" pointer
account       id · userId → user · providerId · accountId · password? · oauth tokens…
verification  id · identifier · value · expiresAt
organization  id · name · slug(uq) · logo? · metadata?     ← A WORKSPACE
member        id · organizationId → org · userId → user
              · role ∈ {owner, admin, member, guest}       ← workspace-level role
invitation    id · organizationId · email · role · status · expiresAt
              · inviterId · createdAt
```

One Better Auth **organization = one workspace**. No parallel workspace
tables — `member` *is* membership, `session.activeOrganizationId` *is* the
switcher. Better Auth's own access-control statements are used only for its
workspace-admin surface; page-level permissions are §4, not Better Auth.

### 2.2 Groups (share-dialog subjects, Notion's "groups")

Owned tables rather than Better Auth's teams plugin (whose semantics are
org-substructure, not permission subjects):

```
groups        id uuid · workspace_id → organization · name · created_at
group_members group_id → groups · user_id → user · PK(group_id, user_id)
```

### 2.3 Content

```
pages           id text PK              -- uuid for user pages, slug for seeded shipped pages
                workspace_id  → organization
                parent_id     → pages   -- THE permission-inheritance edge (one
                                        -- unambiguous parent; render structure may differ)
                visibility    ∈ {workspace, private}      -- Notion: teamspace vs Private
                inherit_permissions boolean default true  -- false = "Restricted"
                created_by    → user
                doc           jsonb $type<LocalPage>()    -- title, icon, slug, settings…
                created_at · updated_at (trigger) · deleted_at (trash)

blocks          id text PK · workspace_id · page_id → pages
                fractional_index text                     -- see §10 decision 1
                doc jsonb $type<LocalBlock>()
                created_at · updated_at
                index (workspace_id), (page_id)

databases       id text PK · workspace_id · host_page_id → pages  -- access = host page's
                doc jsonb $type<LocalDatabase>()

database_rows   id text PK · workspace_id · database_id → databases
                doc jsonb $type<LocalDatabaseRow>()
                index (database_id)

published_pages page_id → pages PK · workspace_id · public_slug text UNIQUE
                include_children boolean · published_by · published_at
```

Locked in from the prototype: **text ids** (shipped content uses slug ids by
design), **doc-jsonb with per-key patch updates** (`doc = doc || $changes`),
server-side `updated_at` triggers.

### 2.4 ReBAC tables

```
page_permissions   page_id → pages
                   subject_type ∈ {user, group, workspace, public}
                   subject_id   text   ('' for workspace/public rows)
                   level ∈ {full_access, edit, comment, view}
                   granted_by → user · granted_at
                   PK (page_id, subject_type, subject_id)

page_ancestors     page_id · ancestor_id · depth      -- closure table, trigger-maintained
                   PK (page_id, ancestor_id)          -- includes (page, page, 0)

user_page_access   user_id · page_id · workspace_id
                   level  (max of all granting paths)  -- MATERIALIZED sync index
                   PK (user_id, page_id) · index (workspace_id, user_id)
```

### 2.5 Sync infrastructure (dev)

`shape_log` + per-table triggers + NOTIFY, exactly as prototyped. Unused (not
dropped) when real Electric connects — the triggers are cheap and keep local
dev Docker-free permanently.

## 3. Route map

### Page routes

| Route | Mode | Purpose |
|---|---|---|
| `/` | anon → blog home (unchanged) · signed-in → workspace home | existing |
| `/$` | anon shipped catch-all | **unchanged** |
| `/p/$`, `/db/…` | workspace pages/databases | existing, both modes |
| `/auth/sign-in` · `/auth/sign-up` | public | replaces the prototype's combined form |
| `/invite/$invitationId` | public → auth → accept | invitation landing (email link + in-app) |
| `/settings/account` | signed-in | profile, email, password, sessions, sign out |
| `/settings/workspace` | signed-in (admin surface gated) | name/icon, default member level, danger zone |
| `/settings/members` | signed-in | members, roles, guests, invites, groups |
| `/settings/workspaces` | signed-in | workspace list, create, switch, leave |
| `/pub/$publicSlug` | public, SSR, cached | published workspace pages (no sync) |

The prototype's standalone `/account` dissolves into the existing `/settings`
shell. The sidebar gains a workspace switcher header (§6).

### API routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/**` | * | Better Auth | sessions, org CRUD, invites |
| `/api/sync/shape` | GET | session + membership + §4.6 filter | Electric-protocol reads |
| `/api/sync/mutate` | POST | session + `can_access` per mutation | transactional writes, txid |
| `/api/pages/:id/permissions` | GET/PUT | `full_access` on page | share dialog (grants, restrict, visibility) |
| `/api/pages/:id/publish` | POST/DELETE | `full_access` | manage `published_pages` |
| `/api/pub/:slug` | GET | public | published page document for SSR |
| `/api/meta` | GET | public | version handshake (desktop clients, §8.5) |

Permission changes get their own endpoint (not mutate): they touch
`page_permissions` + recompute triggers and demand `full_access` — a different
authorization shape than content writes.

## 4. The permission model (Notion-faithful ReBAC)

### 4.1 Capability levels

| Level | Read page/blocks | Comment | Edit content | Share, move, delete, publish, restrict |
|---|---|---|---|---|
| `view` | ✔ | — | — | — |
| `comment` | ✔ | ✔ | — | — |
| `edit` | ✔ | ✔ | ✔ | — |
| `full_access` | ✔ | ✔ | ✔ | ✔ |

`comment` is schema'd now, enforced when comments ship (adding an enum value
later is the painful migration; adding the feature that uses it isn't).

### 4.2 Workspace roles → baselines

| Workspace role | Baseline on `visibility='workspace'` pages | Admin surface |
|---|---|---|
| `owner` | `full_access` | ✔ + delete workspace, transfer |
| `admin` | `full_access` | ✔ |
| `member` | workspace default setting (`edit` \| `comment` \| `view`) | — |
| `guest` | **none** — explicit page grants only | — |

`visibility='private'` pages have no workspace baseline: the creator receives
an automatic `full_access` grant; others see them only when explicitly shared
(Notion's Private section, as a column instead of a sidebar section).

### 4.3 Effective permission

```
effective(user, page):
  chain = ancestors(page), truncated at the nearest ancestor (inclusive)
          with inherit_permissions = false
  candidates =
      { pp.level | pp ∈ page_permissions on any node of chain,
                   subject = user, or user ∈ group, or
                   subject_type='workspace' ∧ user ∈ members(ws, role ≠ guest) }
    ∪ { baseline(user.role) if page.visibility='workspace'
                             and chain reaches the root unbroken }
  return max(candidates)          -- additive down the tree, like Notion
```

**Restrict** (`inherit_permissions=false`) severs everything above; the UI
copies the currently-effective grants onto the page at the moment of
restriction, exactly as Notion's "Restrict access" does.

### 4.4 Two-layer enforcement

**Write path (source of truth)** — `can_access(user_id, page_id, level)`, a
SQL function (closure-table walk + grant/group/membership joins), called
inside every mutate transaction. Required levels: content edits → `edit`;
share/move/delete/publish/restrict → `full_access`; database structure edits
→ `edit` on the host page. Workspace membership is necessary but no longer
sufficient.

**Sync path (projection)** — `user_page_access`, recomputed by triggers on:
`page_permissions` change (page's subtree × affected subjects), `parent_id` /
`inherit_permissions` / `visibility` change (subtree × workspace users),
`member` change (user × workspace), `group_members` change (user × pages
granted to the group). Each recompute is a bounded (users × subtree) slice —
Zanzibar's denormalized-index trade. Escape hatch if a giant org × deep tree
ever hurts: LISTEN/NOTIFY + async worker, same rows.

### 4.5 Shapes under ReBAC

| Shape | Server-injected filter |
|---|---|
| `my-access` | `user_page_access WHERE user_id=$me AND workspace_id=$ws` |
| `pages` | `id IN (SELECT page_id FROM user_page_access WHERE user_id=$me AND workspace_id=$ws)` |
| `blocks` | `page_id IN (…same subquery…)` |
| `databases` | `host_page_id IN (…)` |
| `database_rows` | via databases' host pages (or denormalized `host_page_id`) |
| `members`, `groups` | `workspace_id = $ws` (directory shapes for the share dialog) |

These are the `IN (subquery)` forms real Electric optimizes and incrementally
maintains — revocation is live (the page leaves the revoked user's client the
moment the grant row changes). The dev shape host implements the same filters
as SQL joins. The client also syncs `my-access` to render role-appropriate
chrome; UI gating is convenience — the shape proxy and mutate endpoint are the
only enforcement points.

### 4.6 Why not OpenFGA (recorded rationale)

Better Auth does not provide FGA — its org-plugin access control is
workspace-level RBAC, used here only for the workspace admin surface. The
page-level ReBAC above is deliberately in-Postgres rather than OpenFGA/
SpiceDB, for two structural reasons:

1. **Dual-write consistency.** An external FGA is a second datastore with no
   shared transaction. Every share/move/restrict/member change would write
   Postgres *and* the tuple store, with outbox/compensation machinery to
   approximate what one Postgres transaction gives for free. The
   authorization-relevant facts and the content are the same rows here;
   splitting them manufactures a consistency problem (e.g. a revoked user
   still receiving live sync while projections lag).
2. **Electric can't consult a PDP.** Shapes filter via SQL predicates over
   Postgres rows; there is no per-row callback. Even with OpenFGA, its
   answers would have to be materialized back into Postgres (`ListObjects` →
   `user_page_access`) to filter sync — the flat table gets built either way,
   and OpenFGA would only replace the cheapest part (the check CTE) while
   adding a hosted service, a network hop per write, and an FGA→Postgres
   pipeline.

The in-Postgres design **is** a Zanzibar engine specialized to one relation
graph:

| Zanzibar / OpenFGA | This schema |
|---|---|
| Relation tuples (`page:42#editor@user:7`) | `page_permissions` rows |
| Userset rewrites (`viewer = self ∪ parent.viewer`) | §4.3 over `page_ancestors` + `inherit_permissions` |
| Group expansion (`@group:design#member`) | `group_members` join |
| `Check(user, relation, object)` | `can_access()` |
| `ListObjects` | `user_page_access` (materialized) |
| Zookies / consistency tokens | a Postgres transaction |

What is given up: a generic modeling DSL for arbitrary future object types.
**Flip condition**: if authorization outgrows tree-inheritance (many
heterogeneous object types, cross-application policy, policy tooling for
non-engineers), adopt OpenFGA *as the policy brain* while keeping
`user_page_access` as Electric's filter — FGA computes, a worker writes the
projection, shapes and mutate keep reading exactly what they read today.
`user_page_access` is the deliberate stable seam; swapping its producer
(triggers now, FGA later) is additive, not a rewrite.

## 5. User lifecycle

- **Fresh signup** (`/auth/sign-up`): create account → onboarding step "name
  your workspace" (replaces the prototype's silent auto-create) →
  organization + owner membership + `activeOrganizationId` + `site-workspace`
  cookie → reload into workspace mode → seeded starter page. Email
  verification: real token email in production (dev logs the link — the
  prototype's auto-verify flag is dev-only and must not deploy). Unverified
  users can use their own workspace but cannot see/accept invitations
  (aligning with Better Auth's enforcement rather than fighting it).
- **Invited user**: invite by email + level → invitation row + `/invite/$id`
  email link. Existing account → sign in → accept → membership → workspace
  switch. New account → sign-up prefilled with the invited email → accept in
  the same flow. Pending invitations also surface in-app on
  `/settings/workspaces`.
- **Guest via page share**: share dialog invite with a level on a specific
  page → invitation with `role='guest'` carrying `{pageId, level}` → on
  accept: guest membership + `page_permissions` grant in one transaction.
  Guests' shapes only ever contain what `user_page_access` grants.
- **Workspace switch**: `organization.setActive` + cookie + reload — the
  boot-time mode decision keeps collection identity stable (an architecture
  property, not a shortcut). **Sign-out**: clear session + cookie → anonymous
  blog mode. Local-mode data and workspace data never mix.

## 6. UI surfaces (wireframes)

Sidebar header (workspace mode):

```
┌──────────────────────────┐
│ ⌄ Acme Workspace         │  ← switcher: workspaces, Create, Invite,
│   PAGES                  │     Settings, Sign out
│   ├ 📄 Roadmap           │
│   │   └ 📄 Q3 plan       │
│   🔒 PRIVATE             │  ← visibility='private' section
│   │   └ 📄 My notes      │
│   + New page             │
└──────────────────────────┘
```

Share dialog (page header, requires `full_access`):

```
┌─ Share "Q3 plan" ────────────────────────────────┐
│ Invite by email…                    [Can edit ⌄] │
│──────────────────────────────────────────────────│
│ ⌂ Everyone at Acme         inherited · Can edit  │
│ ◦ Design team (group)                Can view ⌄  │
│ ◦ bob@acme.com                       Can edit ⌄  │
│ ↑ Inherited from "Roadmap"        [Restrict ▸]   │
│──────────────────────────────────────────────────│
│ 🌐 Publish to web        [off ⌄]  /pub/q3-plan   │
└──────────────────────────────────────────────────┘
```

Members settings (`/settings/members`):

```
┌ Members ───────────────────────────────────────────┐
│ Invite: email…              [Member ⌄]  [Invite]   │
│ Alice   alice@acme.com   Owner                     │
│ Bob     bob@acme.com     Member ⌄   [Remove]       │
│ Carol   carol@ext.com    Guest · 2 pages  [View]   │
│ Pending: dave@acme.com   Member  [Resend][Cancel]  │
│ Groups:  Design (3) [Edit] · Eng (5) [Edit] [+New] │
│ Default member access on workspace pages: [Edit ⌄] │
└────────────────────────────────────────────────────┘
```

Auth pages: minimal cards in site typography — sign-up (with workspace-naming
step), sign-in, verify-email interstitial, invitation-accept landing.

## 7. Prototype disposition

| Keep (proven) | Rebuild (deliberately) |
|---|---|
| Dev shape host + protocol contract + e2e/demo harnesses | Schema: hand-SQL → Drizzle-generated (+ groups, ReBAC, visibility, published_pages, fractional_index) |
| Mutate transaction + txid + per-key patch + zero-row synthetic delete | Mutate authorization: membership check → per-mutation `can_access` |
| Boot-time mode fork, collection factory, serialized write queue | `/account` → `/settings/*` + real auth pages + onboarding |
| Seeding idempotency + synced-reader fixes | Silent personal-workspace hook → explicit onboarding |
| Better Auth core choice | Dev auto-verify → real email verification |
| Docker compose stack for real Electric | Block ordering: `blockOrder` array → fractional indexes (§10.1) |

## 8. Desktop client (Electron) — one codebase, three artifacts

The local-first architecture makes the web client ~95% of a desktop client:
rendering, editing, undo/redo, optimistic writes, and (local mode) persistence
all run client-side; the server surface is three HTTP endpoints. Electron adds
a shell, not a second product.

### 8.1 Build targets

```
                 ┌───────────── src/ (one app, one data layer) ─────────────┐
                 │                                                           │
     ┌───────────┴──────────┐    ┌─────────────────────┐    ┌───────────────┴────┐
     │ web (Vite+Nitro SSR) │    │ desktop-renderer     │    │ desktop-main       │
     │ blog + workspace +   │    │ (Vite SPA)           │    │ (Electron)         │
     │ all /api routes      │    │ workspace app only — │    │ window mgmt, deep  │
     │ → Vercel             │    │ no blog, no SSR      │    │ links, auto-update │
     │                      │    │ → bundled files      │    │ later: file mirror │
     └──────────────────────┘    └──────────────────────┘    │ + MCP server       │
                                                             └────────────────────┘
```

The desktop renderer is `SITE_MODE=desktop`: a client-only SPA whose route
tree excludes the blog catch-alls and shipped-content SSR machinery. The blog
remains a web concern; the desktop app is the workspace product.

### 8.2 The platform adapter (`src/platform/`) — the only real seam

| Concern | Web | Desktop |
|---|---|---|
| API origin | relative `/api/…` | configured absolute origin — all fetches go through one `apiUrl()` indirection (the main refactor this imposes; cheap now, expensive later) |
| Auth transport | session cookie | Better Auth **bearer-token plugin**; token held in main process (OS keychain via `safeStorage`), attached to fetches and shape streams. Cookies across `app://` origins are fragile; tokens are the boring reliable choice |
| Storage | localStorage/IndexedDB | same (Electron Chromium); TanStack DB SQLite persistence when offline lands |
| Mode boot | `site-workspace` cookie | main-process-held config, same concept |
| Sign-in UX | in-page | in-app window or system browser + deep link (`site://auth`) |
| Updates | continuous deploy | `electron-updater` |

Everything else — editor, sync, permissions chrome, settings — is shared,
untouched code. Electron over Tauri: system-webview inconsistencies are a real
risk under a keyboard-heavy contenteditable editor; bundled Chromium matches
what the browser tests exercise.

### 8.3 Staged desktop capabilities

- **v1 — shell + sync**: Electron main (window, menus, deep links, updater) +
  SPA renderer against the hosted server. A first-class sync peer.
- **v2 — offline-first**: TanStack DB persistence + Electric resume offsets +
  the serialized write queue draining on reconnect. A collection-layer
  feature — the web app inherits it for free.
- **v3 — the desktop-only differentiator**: the **file mirror + MCP server**
  ([file-mirror.md](./file-mirror.md)) run in the Electron main process —
  "your workspace is a folder," AI agents editing markdown/CSV that syncs
  live everywhere. The mirror was designed as "just another sync client," so
  it is a main-process consumer of the same shape/mutate protocol.

### 8.4 Repo structure: single repo now, monorepo at v3

Today desktop is one `electron/` directory (main, preload, builder config) +
a second Vite config over the same `src/`. Splitting earlier adds tooling drag
with no second consumer. **Graduation trigger = v3**: when the
markdown-canonical codec, mirror engine, and MCP server exist, they have three
consumers (web server, Electron main, CLI/MCP) and the repo becomes a pnpm
workspace:

```
apps/web        (TanStack Start + Nitro — blog + workspace + API)
apps/desktop    (Electron main + renderer build)
packages/app    (shared UI/editor/collections — today's src/)
packages/markdown-canonical
packages/mirror-engine
```

The conversion stays mechanical iff two disciplines start now: the platform
adapter seam stays honest, and server-only code stays out of the client graph
(the `.server.ts` convention).

### 8.5 Release & versioning

Same repo, same version train, different cadences. Web deploys continuously
(client+server always the same commit). Desktop rides tagged releases with
auto-update — so old desktop clients always talk to a newer server. Rules
that make this safe:

- Server API is **additive-only** between desktop releases (the Electric wire
  protocol is already stable; `mutate` and auth are ours to discipline).
- `/api/meta` reports `minSupportedClient`; outdated clients show "please
  update" instead of degrading.
- CI builds desktop artifacts from the same tag that deployed the web — one
  version across all surfaces.

## 9. Build order

1. **Drizzle foundation** — schema.ts + generated migrations + adapter swap +
   `apiUrl()` platform seam. Behavior-identical; the two-browser demo must
   still pass.
2. **ReBAC** — tables, `can_access`, closure/access triggers, mutate
   authorization, shape filters; demo extended (guest can `view` not `edit`;
   live revocation).
3. **Auth & settings UI** — `/auth/*`, `/settings/*`, onboarding, real email
   verification path, invitation landing.
4. **Sharing surface** — share dialog, restrict, visibility, access-aware
   chrome from the `my-access` shape.
5. **Fractional ordering** (per §10.1).
6. **Publishing** — `published_pages` + `/pub/$slug` SSR.
7. **Desktop v1** — `electron/` shell + SPA target + bearer auth.

Each step lands green with the demo harness extended to cover it.

## 10. Open decisions (pending sign-off)

1. **Fractional indexing now vs. later** — recommended now (§2.3): we are
   re-architecting the schema deliberately, and the shared `blockOrder` array
   is the last multi-user contention point. Deferring keeps step 1 smaller
   with a known LWW-ordering caveat.
2. **Default member level** on workspace pages: `edit` (collaborative
   default, recommended) or `view` (locked-down default).
3. **`comment` level**: schema-only now (recommended) or omit until comments
   exist.
4. **Blog's fate**: stays file-based (recommended, per the sync proposal) —
   confirming it is explicitly out of ReBAC scope even though the `public`
   subject could technically serve it.
5. **Groups vs. Better Auth teams**: owned tables (§2.2, recommended); teams
   plugin stays off.
