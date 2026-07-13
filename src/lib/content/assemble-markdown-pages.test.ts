import { describe, expect, it } from "vitest";

import { assembleMarkdownPages } from "./assemble-markdown-pages.ts";
import {
  markdownPathParentSlug,
  markdownPathToSlug,
  slugToIndexMarkdownPath,
  slugToLeafMarkdownPath,
} from "./page-path.ts";

describe("markdown page paths", () => {
  it("maps slugs to both layout variants", () => {
    expect(slugToLeafMarkdownPath("/")).toBe("index.md");
    expect(slugToIndexMarkdownPath("/")).toBe("index.md");
    expect(slugToLeafMarkdownPath("/a/b")).toBe("a/b.md");
    expect(slugToIndexMarkdownPath("/a/b")).toBe("a/b/index.md");
  });

  it("maps paths back to slugs (both variants)", () => {
    expect(markdownPathToSlug("index.md")).toBe("/");
    expect(markdownPathToSlug("a/index.md")).toBe("/a");
    expect(markdownPathToSlug("a.md")).toBe("/a");
    expect(markdownPathToSlug("a/b.md")).toBe("/a/b");
  });

  it("derives the parent scope from the containing folder", () => {
    expect(markdownPathParentSlug("index.md")).toBeNull();
    expect(markdownPathParentSlug("a.md")).toBeNull();
    expect(markdownPathParentSlug("a/index.md")).toBeNull();
    expect(markdownPathParentSlug("a/b.md")).toBe("/a");
    expect(markdownPathParentSlug("a/b/index.md")).toBe("/a");
    expect(markdownPathParentSlug("a/b/c.md")).toBe("/a/b");
  });

  it("rejects traversal segments", () => {
    expect(() => slugToLeafMarkdownPath("/../etc")).toThrow();
  });
});

function file(relativePath: string, lines: string[]): {
  raw: string;
  relativePath: string;
} {
  return { relativePath, raw: `${lines.join("\n")}\n` };
}

describe("assembleMarkdownPages", () => {
  it("derives slug and parentId from the file tree", () => {
    const pages = assembleMarkdownPages([
      file("index.md", ["---", "id: home", "title: Home", "---"]),
      file("work/index.md", ["---", "id: work", "title: Work", "---"]),
      file("work/altitude.md", [
        "---",
        "id: altitude",
        "title: Altitude",
        "---",
        "",
        "Body text.",
      ]),
    ]);
    const bySlug = new Map(pages.map((page) => [page.slug, page]));
    expect(bySlug.get("/")?.parentId).toBeNull();
    expect(bySlug.get("/work")?.parentId).toBeNull();
    expect(bySlug.get("/work/altitude")?.parentId).toBe("work");
    expect(bySlug.get("/work/altitude")?.blocks[0]).toMatchObject({
      type: "text",
      props: { text: "Body text." },
    });
  });

  it("honors the frontmatter parent override", () => {
    const pages = assembleMarkdownPages([
      file("index.md", ["---", "id: home", "title: Home", "---"]),
      file("notes.md", [
        "---",
        "id: notes",
        "title: Notes",
        "parent: home",
        "---",
      ]),
    ]);
    expect(pages.find((page) => page.id === "notes")?.parentId).toBe("home");
  });

  it("resolves relative page links to page ids", () => {
    const pages = assembleMarkdownPages([
      file("work/index.md", [
        "---",
        "id: work",
        "title: Work",
        "---",
        "",
        "[Altitude](./altitude.md)",
      ]),
      file("work/altitude.md", ["---", "id: altitude", "title: Altitude", "---"]),
    ]);
    const work = pages.find((page) => page.id === "work");
    expect(work?.blocks[0]).toMatchObject({
      type: "pageLink",
      props: { pageId: "altitude" },
    });
  });

  it("prefers index.md when both layout variants exist", () => {
    const pages = assembleMarkdownPages([
      file("a.md", ["---", "id: leaf", "title: Leaf", "---"]),
      file("a/index.md", ["---", "id: folder", "title: Folder", "---"]),
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.id).toBe("folder");
  });
});
