import { describe, expect, it } from "vitest";

import { collectInlineLinkHrefs } from "@/lib/media/collect-inline-link-hrefs.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("collectInlineLinkHrefs", () => {
  it("returns unique link mark hrefs in document order", () => {
    const blocks = [
      {
        id: "a",
        type: "text",
        props: {
          text: "one two",
          marks: [
            { type: "link", start: 0, end: 3, href: "https://a.dev" },
            { type: "bold", start: 4, end: 7 },
          ],
        },
      },
      {
        id: "b",
        type: "quote",
        props: {
          text: "again",
          marks: [
            { type: "link", start: 0, end: 5, href: "https://a.dev" },
            { type: "link", start: 0, end: 5, href: "https://b.dev" },
          ],
        },
      },
      {
        id: "c",
        type: "heading",
        props: {
          level: 1,
          text: "ignored",
        },
      },
    ] as Block[];

    expect(collectInlineLinkHrefs(blocks)).toEqual([
      "https://a.dev",
      "https://b.dev",
    ]);
  });

  it("skips empty or missing hrefs", () => {
    const blocks = [
      {
        id: "a",
        type: "text",
        props: {
          text: "x",
          marks: [
            { type: "link", start: 0, end: 1 },
            { type: "link", start: 0, end: 1, href: "  " },
          ],
        },
      },
    ] as Block[];

    expect(collectInlineLinkHrefs(blocks)).toEqual([]);
  });

  it("skips inline page-link marks", () => {
    const blocks = [
      {
        id: "a",
        type: "text",
        props: {
          text: "Notes more",
          marks: [
            {
              type: "link",
              start: 0,
              end: 5,
              href: "https://site.test/notes",
              pageId: "page-1",
            },
            { type: "link", start: 6, end: 10, href: "https://ext.dev" },
          ],
        },
      },
    ] as Block[];

    expect(collectInlineLinkHrefs(blocks)).toEqual(["https://ext.dev"]);
  });
});
