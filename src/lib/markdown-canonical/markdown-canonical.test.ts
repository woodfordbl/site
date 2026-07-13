import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Block } from "@/lib/schemas/block.ts";
import type { BlockColor, InlineMark } from "@/lib/schemas/rich-text.ts";

import { normalizeMarksForSerialization } from "./inline-marks.ts";
import { parsePageMarkdown } from "./parse-page.ts";
import {
  serializeBlocksMarkdown,
  serializePageMarkdown,
} from "./serialize-page.ts";

/**
 * Codec contract tests: golden per-type round trips, the ambiguity rules,
 * and fast-check properties (round-trip equality after id normalization,
 * serializer idempotence, byte-exact plain-text survival).
 */

const FRONTMATTER = { id: "page-1", title: "Test Page" };
const FRONTMATTER_ERROR_RE = /frontmatter/;

function roundTrip(blocks: Block[]): Block[] {
  const markdown = serializePageMarkdown(blocks, FRONTMATTER);
  return parsePageMarkdown(markdown).blocks;
}

let uid = 0;
function id(): string {
  uid += 1;
  return `src-${uid}`;
}

/**
 * Compare blocks independent of ids: ids map to their position, `parentId`
 * and `tabs.defaultTabId` map through, absence-vs-default normalizes, and
 * blank text rows drop (the serializer's documented normal form).
 */
function canon(blocks: Block[]): unknown[] {
  const kept = blocks.filter(
    (block) =>
      !(
        block.type === "text" &&
        block.props.text.length === 0 &&
        block.color === undefined &&
        block.backgroundColor === undefined &&
        (block.indent ?? 0) === 0
      )
  );
  const idMap = new Map(kept.map((block, index) => [block.id, `#${index}`]));
  return kept.map((block) => {
    const props: Record<string, unknown> = { ...block.props };
    if (block.type === "pageLink") {
      // `variant` is display fallback state; the codec drops it by contract.
      props.variant = undefined;
    }
    if (block.type === "tabs" && typeof props.defaultTabId === "string") {
      props.defaultTabId = idMap.get(props.defaultTabId);
    }
    if (Array.isArray(props.marks) && typeof props.text === "string") {
      const shrunk = normalizeMarksForSerialization(
        props.text,
        props.marks as InlineMark[]
      ).sort(
        (a, b) =>
          a.start - b.start || a.end - b.end || a.type.localeCompare(b.type)
      );
      props.marks = shrunk.length > 0 ? shrunk : undefined;
    }
    return {
      id: idMap.get(block.id),
      parentId: block.parentId ? (idMap.get(block.parentId) ?? null) : null,
      indent: block.indent ?? 0,
      color: block.color,
      backgroundColor: block.backgroundColor,
      type: block.type,
      props: JSON.parse(JSON.stringify(props)),
    };
  });
}

function expectRoundTrip(blocks: Block[]): void {
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared assertion helper for the golden cases below
  expect(canon(roundTrip(blocks))).toEqual(canon(blocks));
}

describe("golden round trips per block type", () => {
  it("text with marks and newlines", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "text",
        props: {
          text: "bold italic strike code linked\nsecond line",
          marks: [
            { type: "bold", start: 0, end: 4 },
            { type: "italic", start: 5, end: 11 },
            { type: "strikethrough", start: 12, end: 18 },
            { type: "code", start: 19, end: 23 },
            { type: "link", start: 24, end: 30, href: "https://example.com" },
          ],
        },
      },
    ]);
  });

  it("overlapping bold/italic marks split at boundaries", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "text",
        props: {
          text: "abcdefghij",
          marks: [
            { type: "bold", start: 0, end: 6 },
            { type: "italic", start: 3, end: 9 },
          ],
        },
      },
    ]);
  });

  it("underline via paired <u> html", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "text",
        props: {
          text: "under and boldunder",
          marks: [
            { type: "underline", start: 0, end: 5 },
            { type: "bold", start: 10, end: 19 },
            { type: "underline", start: 10, end: 19 },
          ],
        },
      },
    ]);
  });

  it("literal markdown syntax in prose survives byte-exact", () => {
    const nasty = "not *em* not **strong** | pipe `tick \\ back # hash > quote";
    const parsed = roundTrip([
      { id: id(), type: "text", props: { text: nasty } },
    ]);
    expect(parsed[0]?.type).toBe("text");
    expect((parsed[0] as { props: { text: string } }).props.text).toBe(nasty);
  });

  it("email/www-shaped prose stays plain text (no autolink literals)", () => {
    // CI seed 216668550: gfm autolink literals re-link email-shaped prose
    // AFTER escape resolution, so no serializer escaping survives a reparse.
    // The codec runs a GFM subset without them; explicit <url> autolinks
    // (the embed form) still work.
    const listId = id();
    expectRoundTrip([
      { id: listId, type: "list", props: { variant: "bullet" } },
      { id: id(), parentId: listId, type: "text", props: { text: "!+@0.A" } },
      {
        id: id(),
        parentId: listId,
        type: "text",
        props: { text: "mail user@example.com or visit www.example.com" },
      },
    ]);
    const parsed = roundTrip([
      {
        id: id(),
        type: "text",
        props: { text: "reach me at user@example.com today" },
      },
    ]);
    expect(parsed[0]).toMatchObject({
      type: "text",
      props: { text: "reach me at user@example.com today" },
    });
    expect(
      (parsed[0] as { props: { marks?: unknown[] } }).props.marks
    ).toBeUndefined();
  });

  it("prose ending in an attr-group lookalike gets the sentinel", () => {
    const tricky = "set width via {width=60}";
    const markdown = serializeBlocksMarkdown([
      { id: id(), type: "text", props: { text: tricky } },
    ]);
    expect(markdown).toContain("{}");
    const parsed = parsePageMarkdown(markdown, { lenient: true }).blocks;
    expect((parsed[0] as { props: { text: string } }).props.text).toBe(tricky);
  });

  it("headings 1-4 and colors/indent attrs", () => {
    expectRoundTrip([
      { id: id(), type: "heading", props: { level: 1, text: "One" } },
      { id: id(), type: "heading", props: { level: 4, text: "Four" } },
      {
        id: id(),
        type: "text",
        props: { text: "tinted" },
        color: "red",
        backgroundColor: "yellow",
        indent: 2,
      },
    ]);
  });

  it("toggle heading absorbs its section", () => {
    const toggleId = id();
    expectRoundTrip([
      { id: id(), type: "text", props: { text: "before" } },
      {
        id: toggleId,
        type: "toggleHeading",
        props: { level: 2, text: "Toggle", collapsed: true },
      },
      { id: id(), parentId: toggleId, type: "text", props: { text: "child" } },
      {
        id: id(),
        parentId: toggleId,
        type: "quote",
        props: { text: "child quote" },
      },
      { id: id(), type: "heading", props: { level: 2, text: "After" } },
      { id: id(), type: "text", props: { text: "sibling of toggle" } },
    ]);
  });

  it("quote with multi-paragraph text", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "quote",
        props: { text: "line one\nline two" },
      },
    ]);
  });

  it("callout container with icon and children", () => {
    const calloutId = id();
    expectRoundTrip([
      {
        id: calloutId,
        type: "callout",
        props: { icon: "💡" },
        backgroundColor: "blue",
      },
      { id: id(), parentId: calloutId, type: "text", props: { text: "body" } },
      {
        id: id(),
        parentId: calloutId,
        type: "code",
        props: { text: "x = 1", language: "python" },
      },
    ]);
  });

  it("code fence with language and backticks in body", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "code",
        props: {
          text: "const s = `tpl \u0024{x}`;\n```notafence",
          language: "ts",
        },
      },
    ]);
  });

  it("divider", () => {
    expectRoundTrip([
      { id: id(), type: "text", props: { text: "a" } },
      { id: id(), type: "divider", props: {} },
      { id: id(), type: "text", props: { text: "b" } },
    ]);
  });

  it("bullet and ordered lists with nesting via indent", () => {
    const bulletId = id();
    const orderedId = id();
    expectRoundTrip([
      { id: bulletId, type: "list", props: { variant: "bullet" } },
      { id: id(), parentId: bulletId, type: "text", props: { text: "one" } },
      {
        id: id(),
        parentId: bulletId,
        indent: 1,
        type: "text",
        props: { text: "nested" },
      },
      {
        id: id(),
        parentId: bulletId,
        indent: 2,
        type: "text",
        props: { text: "deeper" },
      },
      { id: id(), parentId: bulletId, type: "text", props: { text: "back" } },
      { id: orderedId, type: "list", props: { variant: "ordered" } },
      { id: id(), parentId: orderedId, type: "text", props: { text: "first" } },
      {
        id: id(),
        parentId: orderedId,
        type: "text",
        props: { text: "second" },
      },
    ]);
  });

  it("checklist with checked states and marks", () => {
    const checklistId = id();
    expectRoundTrip([
      { id: checklistId, type: "checklist", props: {} },
      {
        id: id(),
        parentId: checklistId,
        type: "checklistItem",
        props: {
          checked: true,
          text: "done bold",
          marks: [{ type: "bold", start: 5, end: 9 }],
        },
      },
      {
        id: id(),
        parentId: checklistId,
        type: "checklistItem",
        props: { checked: false, text: "todo" },
      },
    ]);
  });

  it("table with header flags, widths, row heights, and cell marks", () => {
    const tableId = id();
    const row1 = id();
    const row2 = id();
    expectRoundTrip([
      {
        id: tableId,
        type: "table",
        props: {
          hasHeaderRow: false,
          hasHeaderColumn: true,
          columnWidths: [200, 120],
        },
      },
      { id: row1, parentId: tableId, type: "tableRow", props: { height: 48 } },
      {
        id: id(),
        parentId: row1,
        type: "tableCell",
        props: {
          text: "bold | pipe",
          marks: [{ type: "bold", start: 0, end: 4 }],
        },
      },
      { id: id(), parentId: row1, type: "tableCell", props: { text: "b" } },
      { id: row2, parentId: tableId, type: "tableRow", props: {} },
      { id: id(), parentId: row2, type: "tableCell", props: { text: "c" } },
      { id: id(), parentId: row2, type: "tableCell", props: { text: "d" } },
    ]);
  });

  it("media image, video, and asset sources", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "media",
        props: {
          kind: "image",
          source: "url",
          src: "https://example.com/pic.png",
          alt: "A picture",
          widthPercent: 60,
        },
      },
      {
        id: id(),
        type: "media",
        props: {
          kind: "video",
          source: "asset",
          src: "abc123def",
          mimeType: "video/mp4",
          fileName: "clip.mp4",
        },
      },
    ]);
  });

  it("embed with unfurl cache and caption flags", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "embed",
        props: {
          url: "https://example.com/post",
          title: "A Post",
          description: "About things",
          imageUrl: "https://example.com/og.png",
          caption: "the caption",
          showCaption: true,
        },
      },
      {
        id: id(),
        type: "embed",
        props: { url: "https://example.com/other", showCaption: false },
      },
    ]);
  });

  it("pageLink via page: URI without a resolver", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "pageLink",
        props: { pageId: "5f9bb549-2d9c-4902-a469-a4425df12754" },
      },
    ]);
  });

  it("pageLink resolves relative hrefs through the link context", () => {
    const blocks: Block[] = [
      { id: id(), type: "pageLink", props: { pageId: "target-page" } },
    ];
    const markdown = serializePageMarkdown(blocks, FRONTMATTER, {
      resolvePathByPageId: () => "./previous-work/altitude.md",
      resolveLabelByPageId: () => "Altitude",
    });
    expect(markdown).toContain("[Altitude](./previous-work/altitude.md)");
    const parsed = parsePageMarkdown(markdown, {
      linkContext: {
        resolvePageIdByPath: (href) =>
          href === "./previous-work/altitude.md" ? "target-page" : undefined,
      },
    }).blocks;
    expect(parsed[0]).toMatchObject({
      type: "pageLink",
      props: { pageId: "target-page" },
    });
  });

  it("database leaf directive", () => {
    expectRoundTrip([
      {
        id: id(),
        type: "database",
        props: { databaseId: "db-9", viewId: "view-2", hideTitle: true },
      },
    ]);
  });

  it("columns with widths and nested content", () => {
    const columnsId = id();
    const left = id();
    const right = id();
    const nestedList = id();
    expectRoundTrip([
      { id: columnsId, type: "columns", props: {} },
      { id: left, parentId: columnsId, type: "column", props: { width: 2 } },
      { id: id(), parentId: left, type: "text", props: { text: "left" } },
      {
        id: nestedList,
        parentId: left,
        type: "list",
        props: { variant: "bullet" },
      },
      { id: id(), parentId: nestedList, type: "text", props: { text: "item" } },
      { id: right, parentId: columnsId, type: "column", props: {} },
      {
        id: id(),
        parentId: right,
        type: "heading",
        props: { level: 3, text: "Right" },
      },
    ]);
  });

  it("tabs with default tab, size, variant, and icons", () => {
    const tabsId = id();
    const tabA = id();
    const tabB = id();
    expectRoundTrip([
      {
        id: tabsId,
        type: "tabs",
        props: { defaultTabId: tabB, size: "lg", variant: "line" },
      },
      {
        id: tabA,
        parentId: tabsId,
        type: "tab",
        props: { label: "Overview", icon: "🔍" },
      },
      { id: id(), parentId: tabA, type: "text", props: { text: "a body" } },
      { id: tabB, parentId: tabsId, type: "tab", props: { label: "Details" } },
      { id: id(), parentId: tabB, type: "text", props: { text: "b body" } },
    ]);
  });

  it("columns nested inside tabs", () => {
    const tabsId = id();
    const tab = id();
    const cols = id();
    const col = id();
    expectRoundTrip([
      { id: tabsId, type: "tabs", props: {} },
      { id: tab, parentId: tabsId, type: "tab", props: { label: "T" } },
      { id: cols, parentId: tab, type: "columns", props: {} },
      { id: col, parentId: cols, type: "column", props: {} },
      { id: id(), parentId: col, type: "text", props: { text: "deep" } },
    ]);
  });
});

describe("ambiguity rules", () => {
  it("autolink-only paragraph is an embed; linked prose is text", () => {
    const md = [
      "---",
      "id: p",
      "title: T",
      "---",
      "",
      "<https://example.com/e>",
      "",
      "See [the docs](https://example.com/docs) for more.",
    ].join("\n");
    const { blocks } = parsePageMarkdown(md);
    expect(blocks[0]).toMatchObject({
      type: "embed",
      props: { url: "https://example.com/e" },
    });
    expect(blocks[1]?.type).toBe("text");
    expect(blocks[1]).toMatchObject({
      props: {
        marks: [{ type: "link", href: "https://example.com/docs" }].map((m) =>
          expect.objectContaining(m)
        ),
      },
    });
  });

  it("plain blockquote is a quote; [!icon] blockquote is a callout", () => {
    const md = [
      "---",
      "id: p",
      "title: T",
      "---",
      "",
      "> just a quote",
      "",
      "> [!⚠️]",
      ">",
      "> callout body",
    ].join("\n");
    const { blocks } = parsePageMarkdown(md);
    expect(blocks[0]).toMatchObject({
      type: "quote",
      props: { text: "just a quote" },
    });
    expect(blocks[1]).toMatchObject({ type: "callout", props: { icon: "⚠️" } });
    expect(blocks[2]).toMatchObject({
      type: "text",
      parentId: blocks[1]?.id,
      props: { text: "callout body" },
    });
  });

  it("deterministic ids are stable across re-parses", () => {
    const md = serializePageMarkdown(
      [
        { id: id(), type: "text", props: { text: "hello" } },
        { id: id(), type: "divider", props: {} },
      ],
      FRONTMATTER
    );
    const first = parsePageMarkdown(md).blocks;
    const second = parsePageMarkdown(md).blocks;
    expect(first.map((b) => b.id)).toEqual(second.map((b) => b.id));
    expect(new Set(first.map((b) => b.id)).size).toBe(first.length);
  });

  it("lenient mode lifts H1 title and emoji icon", () => {
    const parsed = parsePageMarkdown("# 🚀 Imported Page\n\nBody text.\n", {
      lenient: true,
    });
    expect(parsed.title).toBe("Imported Page");
    expect(parsed.icon).toBe("🚀");
    expect(parsed.blocks[0]).toMatchObject({ props: { text: "Body text." } });
  });

  it("strict mode requires frontmatter", () => {
    expect(() => parsePageMarkdown("just text\n")).toThrow(
      FRONTMATTER_ERROR_RE
    );
  });
});

describe("frontmatter", () => {
  it("round-trips page metadata with fixed key order", () => {
    const frontmatter = {
      id: "abc",
      title: "My Page",
      icon: "tabler:IconHome2Filled",
      order: 3,
      font: "serif" as const,
      textScale: "large" as const,
      fullWidth: true,
      cover: {
        source: "url" as const,
        src: "https://images.example.com/x.jpg",
        focalY: 40,
      },
    };
    const md = serializePageMarkdown([], frontmatter);
    expect(parsePageMarkdown(md).frontmatter).toEqual(frontmatter);
    expect(md.indexOf("id:")).toBeLessThan(md.indexOf("title:"));
    expect(md.indexOf("title:")).toBeLessThan(md.indexOf("icon:"));
  });
});

// --- property tests -------------------------------------------------------

const PLAIN_CHARS = "abc XYZ09*_~`|#>[](){}:!\\-+.\"'&<@$%^=/,;éü千🚀❤️";

/** Lone surrogates are unrepresentable in any text format — exclude them. */
function isWellFormedText(s: string): boolean {
  try {
    encodeURIComponent(s);
    return true;
  } catch {
    return false;
  }
}

const plainTextArb = fc
  .string({ minLength: 1, maxLength: 24, unit: "grapheme" })
  .map((s) => s.replaceAll(/\s/g, " "))
  .filter((s) => s === s.trim() && s.length > 0 && isWellFormedText(s));

const NASTY_TEXT_RE = /^\S(?:[^\n]{0,20}\S)?$/;

const nastyTextArb = fc
  .stringMatching(NASTY_TEXT_RE)
  .filter((s) => s === s.trim() && s.length > 0 && isWellFormedText(s));

const textArb = fc.oneof(
  plainTextArb,
  nastyTextArb,
  fc.constantFrom(...PLAIN_CHARS.split(" ")),
  fc.constant("{width=60}"),
  fc.constant("a {x=1} b {y=2}")
);

const markTypeArb = fc.constantFrom(
  "bold" as const,
  "italic" as const,
  "strikethrough" as const,
  "code" as const,
  "underline" as const,
  "link" as const
);

function marksArb(textLength: number) {
  if (textLength === 0) {
    return fc.constant([] as InlineMark[]);
  }
  return fc.array(
    fc
      .tuple(
        markTypeArb,
        fc.integer({ min: 0, max: textLength - 1 }),
        fc.integer({ min: 1, max: textLength })
      )
      .map(([type, a, b]) => {
        const start =
          Math.min(a, b === a ? a + 1 : b) === a ? a : Math.min(a, b);
        const end = Math.max(a + 1, b);
        return {
          type,
          start: Math.min(start, end - 1),
          end,
          ...(type === "link" ? { href: "https://example.com/x" } : {}),
        } as InlineMark;
      }),
    { maxLength: 3 }
  );
}

const colorArb = fc.option(
  fc.constantFrom<BlockColor>("red", "blue", "green", "yellow", "gray"),
  { nil: undefined }
);

interface GenScope {
  blocks: Block[];
}

const richTextBlockArb: fc.Arbitrary<Block> = textArb.chain((text) =>
  fc
    .tuple(
      marksArb(text.length),
      colorArb,
      colorArb,
      fc.integer({ min: 0, max: 4 })
    )
    .map(([marks, color, backgroundColor, indent]) => ({
      id: id(),
      type: "text" as const,
      props: { text, ...(marks.length > 0 ? { marks } : {}) },
      ...(color ? { color } : {}),
      ...(backgroundColor ? { backgroundColor } : {}),
      ...(indent > 0 ? { indent } : {}),
    }))
);

const headingBlockArb: fc.Arbitrary<Block> = fc
  .tuple(
    textArb,
    fc.constantFrom(1 as const, 2 as const, 3 as const, 4 as const)
  )
  .map(([text, level]) => ({
    id: id(),
    type: "heading" as const,
    props: { level, text },
  }));

const quoteBlockArb: fc.Arbitrary<Block> = textArb.chain((text) =>
  marksArb(text.length).map((marks) => ({
    id: id(),
    type: "quote" as const,
    props: { text, ...(marks.length > 0 ? { marks } : {}) },
  }))
);

const codeBlockArb: fc.Arbitrary<Block> = fc
  .tuple(
    fc.string({ maxLength: 40 }).filter((s) => !s.includes("\r")),
    fc.option(fc.constantFrom("ts", "python", "rust"), { nil: undefined })
  )
  .map(([text, language]) => ({
    id: id(),
    type: "code" as const,
    props: { text, ...(language ? { language } : {}) },
  }));

const listBlockArb: fc.Arbitrary<GenScope> = fc
  .tuple(
    fc.constantFrom("bullet" as const, "ordered" as const),
    fc.array(fc.tuple(textArb, fc.constantFrom(0, 1)), {
      minLength: 1,
      maxLength: 4,
    })
  )
  .map(([variant, items]) => {
    const listId = id();
    const blocks: Block[] = [{ id: listId, type: "list", props: { variant } }];
    let previousIndent = 0;
    let first = true;
    for (const [text, step] of items) {
      // The first item anchors at indent 0 — deeper starts have no host item
      // to nest under, and the canonical form collapses them.
      const indent = first ? 0 : Math.min(previousIndent + step, 4);
      first = false;
      previousIndent = indent;
      blocks.push({
        id: id(),
        parentId: listId,
        ...(indent > 0 ? { indent } : {}),
        type: "text",
        props: { text },
      });
    }
    return { blocks };
  });

const checklistBlockArb: fc.Arbitrary<GenScope> = fc
  .array(fc.tuple(textArb, fc.boolean()), { minLength: 1, maxLength: 4 })
  .map((items) => {
    const checklistId = id();
    const blocks: Block[] = [{ id: checklistId, type: "checklist", props: {} }];
    for (const [text, checked] of items) {
      blocks.push({
        id: id(),
        parentId: checklistId,
        type: "checklistItem",
        props: { checked, text },
      });
    }
    return { blocks };
  });

const mediaBlockArb: fc.Arbitrary<Block> = fc
  .tuple(
    fc.constantFrom("image" as const, "video" as const),
    fc.constantFrom("url" as const, "asset" as const),
    fc.option(fc.integer({ min: 25, max: 100 }), { nil: undefined })
  )
  .map(([kind, source, widthPercent]) => ({
    id: id(),
    type: "media" as const,
    props: {
      kind,
      source,
      src: source === "asset" ? "deadbeef01" : "https://example.com/m.png",
      ...(widthPercent === undefined ? {} : { widthPercent }),
    },
  }));

const leafBlockArb: fc.Arbitrary<GenScope> = fc
  .oneof(
    richTextBlockArb,
    headingBlockArb,
    quoteBlockArb,
    codeBlockArb,
    mediaBlockArb,
    fc.constant<Block>({ id: "", type: "divider", props: {} }).map(() => ({
      id: id(),
      type: "divider" as const,
      props: {},
    }))
  )
  .map((block) => ({ blocks: [block] }));

const scopeArb: fc.Arbitrary<Block[]> = fc
  .array(fc.oneof(leafBlockArb, listBlockArb, checklistBlockArb), {
    minLength: 1,
    maxLength: 5,
  })
  .map((scopes) => scopes.flatMap((scope) => scope.blocks));

describe("properties", () => {
  it("parse(serialize(x)) preserves content (id-normalized)", () => {
    fc.assert(
      fc.property(scopeArb, (blocks) => {
        expect(canon(roundTrip(blocks))).toEqual(canon(blocks));
      }),
      { numRuns: 200 }
    );
  });

  it("serialization is idempotent (canonical normal form)", () => {
    fc.assert(
      fc.property(scopeArb, (blocks) => {
        const once = serializePageMarkdown(blocks, FRONTMATTER);
        const reparsed = parsePageMarkdown(once).blocks;
        const twice = serializePageMarkdown(reparsed, FRONTMATTER);
        expect(twice).toBe(once);
      }),
      { numRuns: 200 }
    );
  });

  it("plain text survives byte-exact through the round trip", () => {
    fc.assert(
      fc.property(textArb, (text) => {
        const parsed = roundTrip([{ id: id(), type: "text", props: { text } }]);
        expect(parsed).toHaveLength(1);
        expect((parsed[0] as { props: { text: string } }).props.text).toBe(
          text
        );
      }),
      { numRuns: 300 }
    );
  });

  it("emoji-heavy marked text keeps UTF-16 offsets aligned", () => {
    const text = "🚀🚀 rocket ❤️ heart 千字";
    fc.assert(
      fc.property(marksArb(text.length), (marks) => {
        expectRoundTrip([
          {
            id: id(),
            type: "text",
            props: { text, ...(marks.length > 0 ? { marks } : {}) },
          },
        ]);
      }),
      { numRuns: 100 }
    );
  });
});
