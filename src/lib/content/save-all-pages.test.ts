import { beforeEach, describe, expect, it, vi } from "vitest";

import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { saveAllLocalPages } from "@/lib/content/save-all-pages.ts";
import { savePage } from "@/lib/content/save-page.ts";

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

vi.mock("@/db/assets/asset-gc.ts", () => ({
  sweepOrphanAssets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/db/collections/local-collections.ts", () => ({
  localPagesCollection: { toArray: [], delete: vi.fn() },
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
  savePage: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/local-draft/dirty-pages-cookie.ts", () => ({
  markPageClean: vi.fn(),
}));

describe("saveAllLocalPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce({ ok: true } as never);

    const result = await saveAllLocalPages();

    expect(result.saved).toBe(1);
    expect(result.failed).toEqual([
      { pageId: "about", title: "About", error: "disk full" },
    ]);
    expect(sweepOrphanAssets).toHaveBeenCalledTimes(1);
  });
});
