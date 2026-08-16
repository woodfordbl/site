import { describe, expect, it } from "vitest";
import {
  decodePageIcon,
  formatTablerPageIcon,
  TABLER_PAGE_ICON_PREFIX,
} from "@/lib/pages/page-icon.ts";
import {
  type EmojibaseEntry,
  parseEmojiCatalog,
} from "@/lib/pages/page-icon-emoji-catalog.ts";

describe("decodePageIcon", () => {
  it("returns default for undefined and empty", () => {
    expect(decodePageIcon()).toEqual({ kind: "default" });
    expect(decodePageIcon("")).toEqual({ kind: "default" });
  });

  it("decodes tabler icons by name", () => {
    expect(decodePageIcon(`${TABLER_PAGE_ICON_PREFIX}IconHome`)).toEqual({
      kind: "tabler",
      name: "IconHome",
    });
  });

  it("decodes any tabler name (catalog resolves at render time)", () => {
    expect(decodePageIcon(`${TABLER_PAGE_ICON_PREFIX}IconAnything`)).toEqual({
      kind: "tabler",
      name: "IconAnything",
    });
  });

  it("returns default for an empty tabler name", () => {
    expect(decodePageIcon(TABLER_PAGE_ICON_PREFIX)).toEqual({
      kind: "default",
    });
  });

  it("decodes emoji values", () => {
    expect(decodePageIcon("🚀")).toEqual({ kind: "emoji", value: "🚀" });
  });
});

describe("formatTablerPageIcon", () => {
  it("prefixes icon names", () => {
    expect(formatTablerPageIcon("IconNotes")).toBe("tabler:IconNotes");
  });
});

describe("parseEmojiCatalog", () => {
  it("drops component-only entries, orders, and builds keywords", () => {
    const entries: EmojibaseEntry[] = [
      { emoji: "🇦", label: "regional indicator A" },
      {
        emoji: "😀",
        label: "grinning face",
        tags: ["happy", "smile"],
        group: 0,
        order: 2,
      },
      { emoji: "👍", label: "thumbs up", group: 1, order: 1 },
    ];

    const catalog = parseEmojiCatalog(entries);

    expect(catalog).toEqual([
      { emoji: "👍", label: "thumbs up", keywords: "thumbs up " },
      {
        emoji: "😀",
        label: "grinning face",
        keywords: "grinning face happy smile",
      },
    ]);
  });
});
