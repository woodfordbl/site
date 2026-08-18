/**
 * @fileoverview drizzle-kit configuration. `src/server/schema.ts` and
 * `src/server/auth-schema.ts` are the schema authority; `drizzle-kit generate`
 * derives baseline DDL from them into `src/server/migrations/`, and
 * `pnpm db:migrate` (`drizzle-kit migrate`) is the only thing that applies
 * migrations to a database.
 *
 * The migrations directory also holds hand-written (`--custom`) migrations for
 * the functions and triggers Drizzle cannot express; drizzle-kit orders every
 * migration by its journal entry, so those always apply after the tables they
 * attach to.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/schema.ts", "./src/server/auth-schema.ts"],
  out: "./src/server/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:password@127.0.0.1:5432/site",
  },
});
