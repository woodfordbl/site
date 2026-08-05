import { describe, expect, it } from "vitest";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  buildPastedPageLinkBlock,
  planInlinePageLinkInsertion,
  resolvePageLinkPastePlacement,
} from "@/lib/canvas/paste-page-link.ts";
import { extractPrimaryPastedUrl } from "@/lib/canvas/paste-url.ts";

function dataTransferOf(parts: {
  html?: string;
  plain?: string;
}): DataTransfer {
  return {
    getData: (type: string) => {
      if (type === "text/plain") {
        return parts.plain ?? "";
      }
      if (type === "text/html") {
        return parts.html ?? "";
      }
      return "";
    },
  } as unknown as DataTransfer;
}

describe("extractPrimaryPastedUrl", () => {
  it("returns a lone plain-text URL", () => {
    expect(
      extractPrimaryPastedUrl(
        dataTransferOf({ plain: "https://example.com/path" })
      )
    ).toBe("https://example.com/path");
  });

  it("returns null for non-URL plain text", () => {
    expect(
      extractPrimaryPastedUrl(dataTransferOf({ plain: "hello world" }))
    ).toBeNull();
  });

  it("extracts href from a single HTML anchor", () => {
    expect(
      extractPrimaryPastedUrl(
        dataTransferOf({
          plain: "Click here",
          html: '<a href="https://example.com/x">Click here</a>',
        })
      )
    ).toBe("https://example.com/x");
  });

  it("returns null for multi-line plain text even with an HTML anchor", () => {
    expect(
      extractPrimaryPastedUrl(
        dataTransferOf({
          plain: "line one\nline two",
          html: '<a href="https://example.com/x">line one</a>',
        })
      )
    ).toBeNull();
  });

  it("returns null for null clipboard data", () => {
    expect(extractPrimaryPastedUrl(null)).toBeNull();
  });
});

describe("resolvePageLinkPastePlacement", () => {
  it("converts empty text-capable leaves", () => {
    expect(resolvePageLinkPastePlacement(createEmptyBlock("text"))).toBe(
      "convert"
    );
    expect(resolvePageLinkPastePlacement(createEmptyBlock("heading"))).toBe(
      "convert"
    );
  });

  it("inlines into any block that already has text", () => {
    for (const type of ["text", "quote", "checklistItem"] as const) {
      const block = createEmptyBlock(type);
      block.props.text = "hello";
      expect(resolvePageLinkPastePlacement(block)).toBe("inline");
    }
  });

  it("inlines into a non-empty heading instead of inserting a row", () => {
    const heading = createEmptyBlock("heading");
    heading.props.text = "Title";
    expect(resolvePageLinkPastePlacement(heading)).toBe("inline");

    const toggle = createEmptyBlock("toggleHeading");
    toggle.props.text = "Section";
    expect(resolvePageLinkPastePlacement(toggle)).toBe("inline");
  });

  it("only inserts a block for types without link-capable text", () => {
    expect(resolvePageLinkPastePlacement(createEmptyBlock("media"))).toBe(
      "insert"
    );
    expect(resolvePageLinkPastePlacement(createEmptyBlock("divider"))).toBe(
      "insert"
    );
  });

  it("skips code and table cells so paste stays plain/inline", () => {
    expect(resolvePageLinkPastePlacement(createEmptyBlock("code"))).toBe(
      "skip"
    );
    expect(resolvePageLinkPastePlacement(createEmptyBlock("tableCell"))).toBe(
      "skip"
    );
  });
});

describe("planInlinePageLinkInsertion", () => {
  const link = { href: "https://site.test/notes", pageId: "page-1" };

  it("appends at the end when there is no selection (rich text)", () => {
    const block = createEmptyBlock("text");
    block.props.text = "see";

    expect(
      planInlinePageLinkInsertion(block, { ...link, title: "Notes" })
    ).toEqual({
      text: "see Notes",
      caret: 9,
      marks: [{ type: "link", start: 4, end: 9, ...link }],
    });
  });

  it("appends at the end of a non-empty heading with no selection", () => {
    const heading = createEmptyBlock("heading");
    heading.props.text = "Title";

    expect(
      planInlinePageLinkInsertion(heading, { ...link, title: "Notes" })
    ).toEqual({
      text: "Title Notes",
      caret: 11,
      marks: [{ type: "link", start: 6, end: 11, ...link }],
    });
  });

  it("replaces the selection and keeps surrounding marks", () => {
    const block = createEmptyBlock("text");
    block.props.text = "bold pick end";
    block.props.marks = [{ type: "bold", start: 0, end: 4 }];

    expect(
      planInlinePageLinkInsertion(block, {
        ...link,
        title: "Notes",
        selection: { start: 5, end: 9 },
      })
    ).toEqual({
      text: "bold Notes end",
      caret: 10,
      marks: [
        { type: "bold", start: 0, end: 4 },
        { type: "link", start: 5, end: 10, ...link },
      ],
    });
  });

  it("returns null for blocks that cannot carry link marks", () => {
    const code = createEmptyBlock("code");
    code.props.text = "const a = 1";
    expect(planInlinePageLinkInsertion(code, { ...link, title: "Notes" })).toBe(
      null
    );
  });
});

describe("buildPastedPageLinkBlock", () => {
  it("builds a linked pageLink", () => {
    expect(buildPastedPageLinkBlock("page-1")).toMatchObject({
      type: "pageLink",
      props: { pageId: "page-1", variant: "linked" },
    });
  });
});
