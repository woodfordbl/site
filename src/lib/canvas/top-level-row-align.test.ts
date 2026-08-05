import { describe, expect, it } from "vitest";
import {
  resolveTopLevelRowAlign,
  type TopLevelRowAlignOptions,
} from "@/lib/canvas/top-level-row-align.ts";
import {
  pageCanvasGutterOutsetPullClassName,
  pageTitleBlockAlignClassName,
} from "@/lib/pages/page-title-layout.ts";

function options(
  overrides: Partial<TopLevelRowAlignOptions> = {}
): TopLevelRowAlignOptions {
  return {
    align: "title-text",
    isNarrowViewport: false,
    isTopLevelRow: true,
    showGutter: false,
    useFullPanelWidth: false,
    ...overrides,
  };
}

describe("resolveTopLevelRowAlign", () => {
  it("indents constrained read-only rows to the title text column", () => {
    expect(resolveTopLevelRowAlign(options())).toEqual({
      contentClassName: pageTitleBlockAlignClassName,
    });
  });

  it("drops the title indent on full-width pages", () => {
    expect(
      resolveTopLevelRowAlign(options({ useFullPanelWidth: true }))
    ).toEqual({});
  });

  it("insets beside the gutter in desktop edit mode", () => {
    expect(resolveTopLevelRowAlign(options({ showGutter: true }))).toEqual({
      contentClassName: "pl-1",
    });
  });

  it("leaves container children untouched", () => {
    expect(resolveTopLevelRowAlign(options({ isTopLevelRow: false }))).toEqual(
      {}
    );
    expect(
      resolveTopLevelRowAlign(
        options({
          align: "content-edge",
          isTopLevelRow: false,
          showGutter: true,
        })
      )
    ).toEqual({});
  });

  it("keeps content-edge rows flush without a gutter inset", () => {
    expect(resolveTopLevelRowAlign(options({ align: "content-edge" }))).toEqual(
      {}
    );
    expect(
      resolveTopLevelRowAlign(
        options({ align: "content-edge", useFullPanelWidth: true })
      )
    ).toEqual({});
  });

  it("outsets the desktop gutter so content-edge rows stay flush", () => {
    expect(
      resolveTopLevelRowAlign(
        options({ align: "content-edge", showGutter: true })
      )
    ).toEqual({ gutterPullClassName: pageCanvasGutterOutsetPullClassName });
  });

  it("ignores the gutter on narrow viewports, where it is absolute", () => {
    expect(
      resolveTopLevelRowAlign(
        options({
          isNarrowViewport: true,
          showGutter: true,
          useFullPanelWidth: true,
        })
      )
    ).toEqual({});
    expect(
      resolveTopLevelRowAlign(
        options({
          align: "content-edge",
          isNarrowViewport: true,
          showGutter: true,
          useFullPanelWidth: true,
        })
      )
    ).toEqual({});
  });
});
