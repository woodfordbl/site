# Local sync stack

Phase 0 of [the sync-engine proposal](../../docs/proposals/realtime-sync-engine.md):
the full production sync topology — Postgres with logical replication feeding the
ElectricSQL sync service — running locally in Docker. Build and test everything against
this; deploying "for real" is an env-var swap, not a code change.

## Run it

```sh
pnpm electric:up      # start postgres (:54321) + electric (:3010)
pnpm electric:smoke   # prove the pipe: initial sync, tx write, live update + txid match
pnpm electric:down    # stop, keep data
pnpm electric:nuke    # stop and delete volumes (fresh init scripts on next up)
```

The smoke test exercises exactly what the app will rely on: an initial shape sync, a
write committed in a Postgres transaction that captures `pg_current_xact_id()::xid`
(the pattern the future `mutate` server function uses), and the change arriving on the
live shape log with a matching `txids` header — the mechanism TanStack DB uses to drop
optimistic overlays.

## Poking at it by hand

```sh
# Shape log from the beginning:
curl "http://localhost:3010/v1/shape?table=sync_demo_items&offset=-1&secret=local-dev-secret"

# SQL console:
docker exec -it site-sync-postgres-1 psql -U postgres -d site
```

Insert a row in psql and re-request the shape (or long-poll with
`&live=true&handle=…&offset=…` from the previous response headers) to watch it stream.

## Shape of things

- `postgres-init/*.sql` seeds a throwaway `sync_demo_items` table. Real schema arrives
  with Phase 2 migrations and replaces it.
- `ELECTRIC_SECRET` mirrors production auth: the secret stays server-side and the app's
  shape proxy (Phase 3) attaches it; browsers never call `:3010` directly.
- Ports are offset (54321 / 3010) so nothing collides with other local services.

## Path to production

| | Local (this stack) | Deployed |
|---|---|---|
| Postgres | `postgres:17-alpine` container, `wal_level=logical` | Neon free tier (direct connection string) |
| Electric | `electricsql/electric` container | Same image on Fly.io/Railway with a volume |
| App | `pnpm dev` | Vercel |
| Config | compose env vars | `DATABASE_URL`, `ELECTRIC_URL`, `ELECTRIC_SECRET` |

Nothing else changes: the app only ever talks to its own shape-proxy and mutate routes,
which read those three env vars.
