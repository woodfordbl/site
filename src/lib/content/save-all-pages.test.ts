import { beforeEach, describe, expect, it, vi } from "vitest";

import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import {
  localDatabasesCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import { saveAllLocalPages } from "@/lib/content/save-all-pages.ts";
import { saveDatabase } from "@/lib/content/save-database.ts";
import { savePage } from "@/lib/content/save-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import type { Page } from "@/lib/schemas/page.ts";

const tombstoned = {
  id: "deleted",
  slug: "/deleted",
  title: "Deleted",
  parentId: null,
  serverBaselineHash: "h",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

const aboutPage = {
  id: "about",
  slug: "/about",
  title: "About",
  parentId: null,
  serverBaselineHash: "h",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const userPage = {
  id: "user",
  slug: "/p/user",
  title: "User",
  parentId: null,
  serverBaselineHash: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const aboutPersisted = {
  id: "about",
  slug: "/about",
  title: "About",
  parentId: null,
  blocks: [{ id: "b1", type: "text", props: { text: "hi" } }],
} as Page;

const userPersisted = {
  id: "user",
  slug: "/p/user",
  title: "User",
  parentId: null,
  blocks: [{ id: "b1", type: "text", props: { text: "hi" } }],
} as Page;

vi.mock("@/db/assets/asset-gc.ts", () => ({
  sweepOrphanAssets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/db/collections/local-collections.ts", () => ({
  localPagesCollection: { toArray: [], delete: vi.fn() },
  localDatabasesCollection: { toArray: [], update: vi.fn() },
  localDatabaseRowsCollection: { toArray: [] },
}));
vi.mock("@/lib/content/save-database.ts", () => ({
  saveDatabase: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/db/collections/read-block-shard.ts", () => ({
  readBlockShardForPage: vi.fn(() => []),
}));
vi.mock("@/db/queries/read-bootstrap-page-blocks.ts", () => ({
  readBootstrapPageBlocks: vi.fn(() => ({
    blocks: [{ id: "b1", type: "text", props: { text: "hi" } }],
    hasLocal: true,
  })),
}));
vi.mock("@/db/queries/block-collection-ops.ts", () => ({
  deleteAllBlocksForPage: vi.fn(),
}));
vi.mock("@/lib/content/prepare-page-document-for-author-save.ts", () => ({
  preparePageDocumentForAuthorSave: vi.fn((doc: unknown) =>
    Promise.resolve({ doc, assets: [] })
  ),
}));
vi.mock("@/lib/content/save-media-assets.ts", () => ({
  saveMediaAssets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/content/save-page.ts", () => ({
  savePage: vi.fn(),
}));
vi.mock("@/lib/local-draft/dirty-pages-cookie.ts", () => ({
  markPageClean: vi.fn(),
}));
vi.mock("@/db/snapshots/page-baseline-store.ts", () => ({
  clearPageBaseline: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/db/snapshots/page-snapshot-store.ts", () => ({
  clearPageSnapshots: vi.fn().mockResolvedValue(undefined),
}));

describe("saveAllLocalPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(savePage)
      .mockResolvedValueOnce({
        ok: true as const,
        page: aboutPersisted,
        path: "/tmp/about.json",
      })
      .mockResolvedValueOnce({
        ok: true as const,
        page: userPersisted,
        path: "/tmp/user.json",
      });
  });

  it("saves every non-tombstoned page and sweeps assets once", async () => {
    (localPagesCollection as unknown as { toArray: unknown[] }).toArray = [
      aboutPage,
      userPage,
      tombstoned,
    ];

    const result = await saveAllLocalPages();

    expect(result.saved).toBe(2);
    expect(result.failed).toHaveLength(0);
    expect(result.savedPages).toEqual([aboutPersisted, userPersisted]);
    expect(savePage).toHaveBeenCalledTimes(2);
    expect(localPagesCollection.delete).toHaveBeenCalledWith("about");
    expect(localPagesCollection.delete).toHaveBeenCalledWith("user");
    expect(localPagesCollection.delete).not.toHaveBeenCalledWith("deleted");
    expect(sweepOrphanAssets).toHaveBeenCalledTimes(1);
  });

  it("records failures without aborting the batch", async () => {
    (localPagesCollection as unknown as { toArray: unknown[] }).toArray = [
      aboutPage,
      userPage,
    ];
    vi.mocked(savePage)
      .mockReset()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce({
        ok: true as const,
        page: userPersisted,
        path: "/tmp/user.json",
      });

    const result = await saveAllLocalPages();

    expect(result.saved).toBe(1);
    expect(result.failed).toEqual([
      { pageId: "about", title: "About", error: "disk full" },
    ]);
    expect(localPagesCollection.delete).toHaveBeenCalledWith("user");
    expect(localPagesCollection.delete).not.toHaveBeenCalledWith("about");
    expect(sweepOrphanAssets).toHaveBeenCalledTimes(1);
  });

  it("awaits beforeClearLocal before tearing down local overlays", async () => {
    (localPagesCollection as unknown as { toArray: unknown[] }).toArray = [
      aboutPage,
    ];
    vi.mocked(savePage)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true as const,
        page: aboutPersisted,
        path: "/tmp/about.json",
      });

    let sawDeleteDuringBeforeClear = false;
    await saveAllLocalPages({
      beforeClearLocal: (savedPages) => {
        sawDeleteDuringBeforeClear =
          vi.mocked(localPagesCollection.delete).mock.calls.length > 0;
        expect(savedPages).toEqual([aboutPersisted]);
      },
    });

    expect(sawDeleteDuringBeforeClear).toBe(false);
    expect(localPagesCollection.delete).toHaveBeenCalledWith("about");
    expect(deleteAllBlocksForPage).toHaveBeenCalled();
    expect(markPageClean).toHaveBeenCalledWith("about");
  });

  it("writes the page createdAt and the newest block updatedAt", async () => {
    (localPagesCollection as unknown as { toArray: unknown[] }).toArray = [
      aboutPage,
    ];
    vi.mocked(readBlockShardForPage).mockReturnValueOnce([
      {
        id: "b1",
        type: "text",
        props: { text: "hi" },
        pageId: "about",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ] as never);
    vi.mocked(savePage)
      .mockReset()
      .mockImplementation(((options: unknown) => {
        const data = (options as { data: Page }).data;
        return Promise.resolve({
          ok: true as const,
          page: data,
          path: "/tmp/about.json",
        });
      }) as typeof savePage);

    await saveAllLocalPages();

    expect(savePage).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
    });
  });

  it("falls back to the page updatedAt when no block is newer", async () => {
    (localPagesCollection as unknown as { toArray: unknown[] }).toArray = [
      aboutPage,
    ];
    vi.mocked(savePage)
      .mockReset()
      .mockImplementation(((options: unknown) => {
        const data = (options as { data: Page }).data;
        return Promise.resolve({
          ok: true as const,
          page: data,
          path: "/tmp/about.json",
        });
      }) as typeof savePage);

    await saveAllLocalPages();

    expect(savePage).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
  });

  it("exports changed databases, stamps their baseline, and skips unchanged ones", async () => {
    (localPagesCollection as unknown as { toArray: unknown[] }).toArray = [];
    const changed = {
      id: "db-changed",
      name: "Reading list",
      primaryFieldId: "f1",
      fields: [],
      views: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const unchanged = {
      ...changed,
      id: "db-unchanged",
      // hashDatabaseDocument of the exported doc below — verified by the
      // stamp call this test asserts for the changed database.
      serverBaselineHash: "stale-baseline",
    };
    (localDatabasesCollection as unknown as { toArray: unknown[] }).toArray = [
      changed,
      unchanged,
    ];

    const first = await saveAllLocalPages();
    expect(first.savedDatabases).toBe(2); // both differ from their baseline
    expect(saveDatabase).toHaveBeenCalledTimes(2);
    expect(localDatabasesCollection.update).toHaveBeenCalledWith(
      "db-changed",
      expect.any(Function)
    );

    // Stamp the baseline the way the real update would, then save again:
    // byte-identical content is skipped.
    const stampedHash = (() => {
      const draft = { serverBaselineHash: "", updatedAt: "" };
      const updater = vi.mocked(localDatabasesCollection.update).mock
        .calls[0]?.[1] as (d: typeof draft) => void;
      updater(draft);
      return draft.serverBaselineHash;
    })();
    (localDatabasesCollection as unknown as { toArray: unknown[] }).toArray = [
      { ...changed, serverBaselineHash: stampedHash },
    ];
    vi.mocked(saveDatabase).mockClear();

    const second = await saveAllLocalPages();
    expect(second.savedDatabases).toBe(0);
    expect(saveDatabase).not.toHaveBeenCalled();
  });
});
