// biome-ignore-all lint: throwaway demo/probe script driven manually against a dev server.
// Isolated electric-collection test against the dev shape host (node).

import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";
import { z } from "zod";

const BASE = "http://localhost:3000";
const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({
    name: "Iso",
    email: `iso-${Date.now()}@x.dev`,
    password: "password1234",
  }),
});
const cookie = signUp.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
const session = await (
  await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie } })
).json();
const ws = session.session.activeOrganizationId;

const schema = z.object({ id: z.string() }).passthrough();
const collection = createCollection(
  electricCollectionOptions({
    id: "iso-pages",
    schema,
    getKey: (r) => r.id,
    shapeOptions: {
      url: `${BASE}/api/sync/shape`,
      params: { table: "pages", ws },
      headers: { cookie },
    },
    onInsert: async ({ transaction }) => {
      const res = await fetch(`${BASE}/api/sync/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          workspaceId: ws,
          mutations: transaction.mutations.map((m) => ({
            table: "pages",
            op: "insert",
            id: String(m.key),
            doc: m.modified,
          })),
        }),
      });
      const { txid } = await res.json();
      console.log("insert returned txid", txid);
      return { txid };
    },
  })
);
collection.startSyncImmediate();
await collection.preload();
console.log("preloaded; status:", collection.status, "size:", collection.size);

const id = crypto.randomUUID();
const tx = collection.insert({ id, slug: "/iso", title: "Iso page" });
console.log(
  "after optimistic insert: size",
  collection.size,
  "toArray len",
  collection.toArray.length
);
await tx.isPersisted.promise;
console.log(
  "persisted. size:",
  collection.size,
  "toArray:",
  collection.toArray.length,
  "has(id):",
  collection.has(id)
);
await new Promise((r) => setTimeout(r, 1500));
console.log(
  "after settle: size:",
  collection.size,
  "toArray:",
  collection.toArray.length,
  "has(id):",
  collection.has(id),
  "status:",
  collection.status
);
process.exit(0);
