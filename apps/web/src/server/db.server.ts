/**
 * Server-side Postgres pool. Content queries (shape host, mutate endpoint) use
 * this directly with parameterized SQL; Better Auth shares the same pool via
 * its built-in adapter so auth and content mutate in one database.
 */
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
