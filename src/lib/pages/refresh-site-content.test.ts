import { describe, expect, it, vi } from "vitest";
import { refreshSiteContent } from "@/lib/pages/refresh-site-content.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";

vi.mock("@/lib/pages/reset-page-to-remote.ts", () => ({
  resetPageToRemote: vi.fn(),
}));
vi.mock("@/db/collections/local-collections.ts", () => ({
  localPagesCollection: { toArray: [] },
}));
vi.mock("@/lib/pages/page-list-local-preview-cookie.ts", () => ({
  syncPageListLocalPreviewFromCollection: vi.fn(),
}));

describe("refreshSiteContent", () => {
  it("resets each stale page id and nothing else", () => {
    vi.mocked(resetPageToRemote).mockClear();

    refreshSiteContent(["about", "notes"]);

    expect(resetPageToRemote).toHaveBeenCalledTimes(2);
    expect(resetPageToRemote).toHaveBeenNthCalledWith(1, "about");
    expect(resetPageToRemote).toHaveBeenNthCalledWith(2, "notes");
  });

  it("does nothing when there are no stale pages", () => {
    vi.mocked(resetPageToRemote).mockClear();

    refreshSiteContent([]);

    expect(resetPageToRemote).not.toHaveBeenCalled();
  });
});
