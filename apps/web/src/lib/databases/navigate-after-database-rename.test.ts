// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { navigateAfterDatabaseHubRename } from "@/lib/databases/navigate-after-database-rename.ts";

describe("navigateAfterDatabaseHubRename", () => {
  afterEach(() => {
    window.history.replaceState(window.history.state, "", "/");
  });

  it("router-navigates with replace when the open path sits under the old hub", () => {
    window.history.replaceState({}, "", "/p/work/untitled");
    const navigate = vi.fn();

    navigateAfterDatabaseHubRename(navigate, {
      nextHubSlug: "/work/stocks",
      previousHubSlug: "/work/untitled",
    });

    expect(navigate).toHaveBeenCalledWith({
      params: { _splat: "work/stocks" },
      replace: true,
      to: "/p/$",
    });
  });

  it("is a no-op when the open path is unrelated", () => {
    window.history.replaceState({}, "", "/p/other-page");
    const navigate = vi.fn();

    navigateAfterDatabaseHubRename(navigate, {
      nextHubSlug: "/work/stocks",
      previousHubSlug: "/work/untitled",
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("is a no-op when there is no slug change", () => {
    window.history.replaceState({}, "", "/p/work/untitled");
    const navigate = vi.fn();

    navigateAfterDatabaseHubRename(navigate, null);

    expect(navigate).not.toHaveBeenCalled();
  });
});
