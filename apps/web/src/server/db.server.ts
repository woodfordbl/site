/**
 * @fileoverview The server's single Postgres connection. One pool backs
 * everything: the raw parameterized SQL of the shape host and the mutate
 * endpoint reaches it through {@link getPool}, and Better Auth and the query
 * builder reach the same pool through {@link db}, so auth and content mutate
 * in one database and share one connection budget.
 *
 * Row types come from the table objects in `src/server/schema.ts` and
 * `src/server/auth-schema.ts` at the call site — notably the `doc` columns,
 * which are the client's zod documents verbatim.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:5432/site";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  }
  return pool;
}

/** Drizzle over {@link getPool}'s pool. Not a second connection. */
export const db = drizzle(getPool());
