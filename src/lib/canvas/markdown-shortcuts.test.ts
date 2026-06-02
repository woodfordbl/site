import { describe, expect, it } from "vitest";
import {
  getMarkdownShortcutHint,
  matchMarkdownShortcut,
  requiresTopLevelRow,
} from "@/lib/canvas/markdown-shortcuts.ts";

describe("matchMarkdownShortcut", () => {
  it("matches heading prefixes", () => {
    expect(matchMarkdownShortcut("#")).toEqual({ kind: "heading", level: 1 });
    expect(matchMarkdownShortcut("##")).toEqual({ kind: "heading", level: 2 });
    expect(matchMarkdownShortcut("###")).toEqual({ kind: "heading", level: 3 });
    expect(matchMarkdownShortcut("####")).toEqual({
      kind: "heading",
      level: 4,
    });
  });

  it("matches list and divider prefixes", () => {
    expect(matchMarkdownShortcut("-")).toEqual({
      kind: "list",
      variant: "bullet",
    });
    expect(matchMarkdownShortcut("1.")).toEqual({
      kind: "list",
      variant: "ordered",
    });
    expect(matchMarkdownShortcut("---")).toEqual({ kind: "divider" });
    expect(matchMarkdownShortcut("[]")).toEqual({ kind: "checklist" });
  });

  it("returns null for non-matching text", () => {
    expect(matchMarkdownShortcut("")).toBeNull();
    expect(matchMarkdownShortcut("#hello")).toBeNull();
    expect(matchMarkdownShortcut("2.")).toBeNull();
    expect(matchMarkdownShortcut("--")).toBeNull();
    expect(matchMarkdownShortcut("----")).toBeNull();
    expect(matchMarkdownShortcut("*")).toBeNull();
    expect(matchMarkdownShortcut(">")).toBeNull();
  });
});

describe("requiresTopLevelRow", () => {
  it("requires top-level rows for list, divider, and heading shortcuts", () => {
    expect(requiresTopLevelRow({ kind: "list", variant: "bullet" })).toBe(true);
    expect(requiresTopLevelRow({ kind: "checklist" })).toBe(true);
    expect(requiresTopLevelRow({ kind: "list", variant: "ordered" })).toBe(
      true
    );
    expect(requiresTopLevelRow({ kind: "divider" })).toBe(true);
    expect(requiresTopLevelRow({ kind: "heading", level: 1 })).toBe(true);
    expect(requiresTopLevelRow({ kind: "heading", level: 4 })).toBe(true);
  });
});

describe("getMarkdownShortcutHint", () => {
  it("returns markdown hints for supported slash menu items", () => {
    expect(
      getMarkdownShortcutHint({
        key: "heading-1",
        id: "heading",
        headingLevel: 1,
        label: "Heading 1",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBe("#");
    expect(
      getMarkdownShortcutHint({
        key: "heading-4",
        id: "heading",
        headingLevel: 4,
        label: "Heading 4",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBe("####");
    expect(
      getMarkdownShortcutHint({
        key: "list-bullet",
        id: "list",
        listVariant: "bullet",
        label: "Bullet list",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBe("-");
    expect(
      getMarkdownShortcutHint({
        key: "list-ordered",
        id: "list",
        listVariant: "ordered",
        label: "Numbered list",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBe("1.");
    expect(
      getMarkdownShortcutHint({
        key: "checklist",
        id: "checklist",
        label: "Checklist",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBe("[]");
    expect(
      getMarkdownShortcutHint({
        key: "divider",
        id: "divider",
        label: "Divider",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBe("---");
  });

  it("returns undefined for items without markdown shortcuts", () => {
    expect(
      getMarkdownShortcutHint({
        key: "text",
        id: "text",
        label: "Text",
        aliases: [],
        icon: () => null,
        keywords: [],
      })
    ).toBeUndefined();
  });
});
