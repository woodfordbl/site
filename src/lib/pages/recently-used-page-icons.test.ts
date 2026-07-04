// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "page-icon:recently-used";

async function loadStore() {
  vi.resetModules();
  return await import("@/lib/pages/recently-used-page-icons.ts");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("recentlyUsedPageIcons", () => {
  it("starts empty", async () => {
    const { getRecentlyUsedPageIcons } = await loadStore();
    expect(getRecentlyUsedPageIcons()).toEqual({ emoji: [], tabler: [] });
  });

  it("routes emojis and tabler icons into separate lists", async () => {
    const { getRecentlyUsedPageIcons, recordRecentlyUsedPageIcon } =
      await loadStore();
    recordRecentlyUsedPageIcon("🚀");
    recordRecentlyUsedPageIcon("tabler:IconHome");
    expect(getRecentlyUsedPageIcons()).toEqual({
      emoji: ["🚀"],
      tabler: ["tabler:IconHome"],
    });
  });

  it("ignores the default (empty) icon", async () => {
    const { getRecentlyUsedPageIcons, recordRecentlyUsedPageIcon } =
      await loadStore();
    recordRecentlyUsedPageIcon("");
    expect(getRecentlyUsedPageIcons()).toEqual({ emoji: [], tabler: [] });
  });

  it("promotes a repeated icon to the front without duplicating", async () => {
    const { getRecentlyUsedPageIcons, recordRecentlyUsedPageIcon } =
      await loadStore();
    recordRecentlyUsedPageIcon("😀");
    recordRecentlyUsedPageIcon("🎉");
    recordRecentlyUsedPageIcon("😀");
    expect(getRecentlyUsedPageIcons().emoji).toEqual(["😀", "🎉"]);
  });

  it("caps each list at eight entries, newest first", async () => {
    const { getRecentlyUsedPageIcons, recordRecentlyUsedPageIcon } =
      await loadStore();
    for (let i = 0; i < 10; i++) {
      recordRecentlyUsedPageIcon(`tabler:Icon${i}`);
    }
    const { tabler } = getRecentlyUsedPageIcons();
    expect(tabler).toHaveLength(8);
    expect(tabler[0]).toBe("tabler:Icon9");
    expect(tabler.at(-1)).toBe("tabler:Icon2");
  });

  it("persists to localStorage and rehydrates on reload", async () => {
    const first = await loadStore();
    first.recordRecentlyUsedPageIcon("⭐");
    expect(localStorage.getItem(STORAGE_KEY)).toContain("⭐");

    const reloaded = await loadStore();
    expect(reloaded.getRecentlyUsedPageIcons().emoji).toEqual(["⭐"]);
  });

  it("ignores malformed stored data", async () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    const { getRecentlyUsedPageIcons } = await loadStore();
    expect(getRecentlyUsedPageIcons()).toEqual({ emoji: [], tabler: [] });
  });
});
