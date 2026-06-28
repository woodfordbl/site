import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "@/lib/markdown/markdown-to-blocks.ts";
import { pageToMarkdown } from "@/lib/markdown/page-to-markdown.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { Page } from "@/lib/schemas/page.ts";

function page(blocks: Block[], overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    slug: "test",
    title: "Test Page",
    parentId: null,
    blocks,
    ...overrides,
  };
}

describe("pageToMarkdown", () => {
  it("leads with an H1 title and renders block types", () => {
    const md = pageToMarkdown(
      page([
        { id: "h", type: "heading", props: { level: 2, text: "Section" } },
        { id: "t", type: "text", props: { text: "A paragraph." } },
        { id: "q", type: "quote", props: { text: "Quoted." } },
        { id: "d", type: "divider", props: {} },
        {
          id: "c",
          type: "code",
          props: { text: "const x = 1;", language: "ts" },
        },
      ])
    );

    expect(md).toContain("# Test Page");
    expect(md).toContain("## Section");
    expect(md).toContain("A paragraph.");
    expect(md).toContain("> Quoted.");
    expect(md).toContain("---");
    expect(md).toContain("```ts\nconst x = 1;\n```");
  });

  it("includes an emoji icon in the title", () => {
    const md = pageToMarkdown(page([], { icon: "🚀" }));
    expect(md.startsWith("# 🚀 Test Page")).toBe(true);
  });

  it("renders bullet and checklist containers", () => {
    const md = pageToMarkdown(
      page([
        { id: "l", type: "list", props: { variant: "bullet" } },
        { id: "li1", type: "text", parentId: "l", props: { text: "one" } },
        { id: "li2", type: "text", parentId: "l", props: { text: "two" } },
        { id: "cl", type: "checklist", props: {} },
        {
          id: "ci1",
          type: "checklistItem",
          parentId: "cl",
          props: { checked: true, text: "done" },
        },
        {
          id: "ci2",
          type: "checklistItem",
          parentId: "cl",
          props: { checked: false, text: "todo" },
        },
      ])
    );

    expect(md).toContain("- one\n- two");
    expect(md).toContain("- [x] done");
    expect(md).toContain("- [ ] todo");
  });

  it("renders a GFM table", () => {
    const md = pageToMarkdown(
      page([
        {
          id: "tbl",
          type: "table",
          props: {
            hasHeaderRow: true,
            hasHeaderColumn: false,
            columnWidths: [120, 120],
          },
        },
        { id: "r1", type: "tableRow", parentId: "tbl", props: {} },
        { id: "r1c1", type: "tableCell", parentId: "r1", props: { text: "A" } },
        { id: "r1c2", type: "tableCell", parentId: "r1", props: { text: "B" } },
        { id: "r2", type: "tableRow", parentId: "tbl", props: {} },
        { id: "r2c1", type: "tableCell", parentId: "r2", props: { text: "1" } },
        { id: "r2c2", type: "tableCell", parentId: "r2", props: { text: "2" } },
      ])
    );

    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
  });
});

describe("markdownToBlocks", () => {
  it("extracts the title and emoji icon from the first H1", () => {
    const parsed = markdownToBlocks("# 🚀 My Notes\n\nBody text.");
    expect(parsed.title).toBe("My Notes");
    expect(parsed.icon).toBe("🚀");
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]).toMatchObject({
      type: "text",
      props: { text: "Body text." },
    });
  });

  it("parses headings, code, quotes, and dividers", () => {
    const parsed = markdownToBlocks(
      [
        "## Heading",
        "",
        "> a quote",
        "",
        "```js",
        "x()",
        "```",
        "",
        "---",
      ].join("\n")
    );
    const types = parsed.blocks.map((block) => block.type);
    expect(types).toEqual(["heading", "quote", "code", "divider"]);
    const code = parsed.blocks[2];
    expect(code).toMatchObject({
      type: "code",
      props: { text: "x()", language: "js" },
    });
  });

  it("parses lists and checklists into containers with children", () => {
    const parsed = markdownToBlocks(
      ["- one", "- two", "", "- [ ] todo", "- [x] done"].join("\n")
    );

    const list = parsed.blocks.find((block) => block.type === "list");
    expect(list).toBeDefined();
    const listItems = parsed.blocks.filter(
      (block) => block.parentId === list?.id
    );
    expect(
      listItems.map((block) => (block.props as { text: string }).text)
    ).toEqual(["one", "two"]);

    const checklist = parsed.blocks.find((block) => block.type === "checklist");
    const items = parsed.blocks.filter(
      (block) => block.parentId === checklist?.id
    );
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      type: "checklistItem",
      props: { checked: true, text: "done" },
    });
  });

  it("parses a GFM table into table/row/cell blocks", () => {
    const parsed = markdownToBlocks(
      ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n")
    );
    const table = parsed.blocks.find((block) => block.type === "table");
    expect(table).toBeDefined();
    const rows = parsed.blocks.filter((block) => block.type === "tableRow");
    const cells = parsed.blocks.filter((block) => block.type === "tableCell");
    expect(rows).toHaveLength(2);
    expect(cells.map((cell) => (cell.props as { text: string }).text)).toEqual([
      "A",
      "B",
      "1",
      "2",
    ]);
  });

  it("round-trips a document through export and import", () => {
    const original = page(
      [
        { id: "h", type: "heading", props: { level: 2, text: "Section" } },
        { id: "t", type: "text", props: { text: "Hello world." } },
        { id: "l", type: "list", props: { variant: "bullet" } },
        { id: "li1", type: "text", parentId: "l", props: { text: "alpha" } },
        { id: "li2", type: "text", parentId: "l", props: { text: "beta" } },
        { id: "c", type: "code", props: { text: "y = 2", language: "py" } },
      ],
      { icon: "📓" }
    );

    const parsed = markdownToBlocks(pageToMarkdown(original));
    expect(parsed.title).toBe("Test Page");
    expect(parsed.icon).toBe("📓");

    const types = parsed.blocks.map((block) => block.type);
    expect(types).toEqual(["heading", "text", "list", "text", "text", "code"]);
  });
});
