# Local sync stack

The production sync topology — Postgres with logical replication feeding the
ElectricSQL sync service — running locally in Docker. Build and test against this;
deploying "for real" is an env-var swap, not a code change.

## Run it

```sh
pnpm electric:up      # start postgres (:54321) + electric (:3010)
pnpm electric:down    # stop, keep data
pnpm electric:nuke    # stop and delete volumes
```

Apply the schema with `pnpm db:migrate` (point `DATABASE_URL` at
`postgresql://postgres:password@localhost:54321/site`). Postgres alone is enough for
local work: the app serves the shape protocol itself in dev, so the Electric container
only matters when verifying against the real service.

## Poking at it by hand

```sh
# Shape log from the beginning:
curl "http://localhost:3010/v1/shape?table=pages&offset=-1&secret=local-dev-secret"

# SQL console:
docker exec -it site-sync-postgres-1 psql -U postgres -d site
```

Write a row in psql and re-request the shape (or long-poll with
`&live=true&handle=…&offset=…` from the previous response headers) to watch it stream.

## Shape of things

- `ELECTRIC_SECRET` mirrors production auth: the secret stays server-side and the app's
  shape proxy attaches it; browsers never call `:3010` directly.
- Ports are offset (54321 / 3010) so nothing collides with other local services.

## Path to production

| | Local (this stack) | Deployed |
|---|---|---|
| Postgres | `postgres:17-alpine` container, `wal_level=logical` | Neon (direct connection string) |
| Electric | `electricsql/electric` container | Same image on Fly.io/Railway with a volume |
| App | `pnpm dev` | Vercel |
| Config | compose env vars | `DATABASE_URL`, `ELECTRIC_URL`, `ELECTRIC_SECRET` |

Nothing else changes: the app only ever talks to its own shape-proxy and mutate routes,
which read those three env vars.
