import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { watch } from "chokidar";
import type { Plugin } from "vite";

/**
 * Dev-only content watcher: chokidar over `content/`, broadcasting
 * `site:content-changed` custom events on Vite's HMR websocket. This is the
 * inbound half of dev disk mode — the main Vite watcher ignores `content/`
 * (see `server.watch.ignored` in vite.config.ts) so editor flushes never
 * churn the module graph; THIS watcher tells the client what changed
 * instead. Bursts (git checkout) coalesce into one `bulk` event.
 */

const STABILITY_MS = 80;
const EVENT_DEBOUNCE_MS = 150;
const BULK_THRESHOLD = 20;

/** djb2 over the file text — must match `hashStableValue` on a string. */
function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash, 33) + input.charCodeAt(index);
    hash %= 2_147_483_647;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function hashLikeStableValue(text: string): string {
  return hashString(JSON.stringify(text));
}

export function contentWatchPlugin(): Plugin {
  return {
    name: "site:content-watch",
    apply: "serve",
    configureServer(server) {
      const contentRoot = join(server.config.root, "content");
      const watcher = watch(contentRoot, {
        ignoreInitial: true,
        ignored: (path: string) => path.includes(".tmp-"),
        awaitWriteFinish: {
          stabilityThreshold: STABILITY_MS,
          pollInterval: 20,
        },
      });

      const pendingEvents = new Map<
        string,
        { event: "add" | "change" | "unlink" }
      >();
      let flushTimer: NodeJS.Timeout | null = null;

      const broadcast = (data: Record<string, unknown>) => {
        server.ws.send({
          type: "custom",
          event: "site:content-changed",
          data,
        });
      };

      const broadcastOne = async (
        path: string,
        event: "add" | "change" | "unlink"
      ) => {
        const kind = path.startsWith("databases/") ? "database" : "page";
        let contentHash: string | undefined;
        if (event !== "unlink") {
          try {
            contentHash = hashLikeStableValue(
              await readFile(join(contentRoot, path), "utf-8")
            );
          } catch {
            return; // vanished between the event and the read
          }
        }
        broadcast({ event, kind, path, contentHash });
      };

      const flush = async () => {
        flushTimer = null;
        const batch = [...pendingEvents.entries()];
        pendingEvents.clear();
        if (batch.length === 0) {
          return;
        }
        if (batch.length > BULK_THRESHOLD) {
          broadcast({ event: "bulk", kind: "page" });
          return;
        }
        for (const [path, { event }] of batch) {
          await broadcastOne(path, event);
        }
      };

      const record = (event: "add" | "change" | "unlink", fullPath: string) => {
        const path = relative(contentRoot, fullPath).replaceAll("\\", "/");
        if (!(path.endsWith(".md") || path.endsWith(".csv"))) {
          return;
        }
        pendingEvents.set(path, { event });
        if (flushTimer) {
          clearTimeout(flushTimer);
        }
        flushTimer = setTimeout(() => {
          flush().catch(() => undefined);
        }, EVENT_DEBOUNCE_MS);
      };

      watcher.on("add", (path) => record("add", path));
      watcher.on("change", (path) => record("change", path));
      watcher.on("unlink", (path) => record("unlink", path));

      server.httpServer?.once("close", () => {
        watcher.close().catch(() => undefined);
      });
    },
  };
}
