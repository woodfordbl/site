/**
 * Minimal forward-only SQL migration runner for src/server/migrations/*.sql.
 * Applied filenames are recorded in _migrations; each file runs in one
 * transaction. Usage: DATABASE_URL=postgres://… node scripts/db-migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:5432/site";
const MIGRATIONS_DIR = new URL("../src/server/migrations", import.meta.url)
  .pathname;

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())"
  );
  const applied = new Set(
    (await client.query("select name from _migrations")).rows.map(
      (row) => row.name
    )
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) =>
    f.endsWith(".sql")
  );
  files.sort();
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
