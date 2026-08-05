import {
  pageCanvasGutterOutsetPullClassName,
  pageTitleBlockAlignClassName,
} from "@/lib/pages/page-title-layout.ts";

/**
 * Left-edge anchor for a canvas page's **top-level** rows (container children
 * always follow their container).
 *
 * - `"title-text"` — ordinary pages: row content lines up with the page title's
 *   text, i.e. after the page-icon slot.
 * - `"content-edge"` — the row-page family (database row pages, row templates,
 *   preview-as-row): row content starts flush at the content column's left
 *   edge, so blocks line up with the properties band above them, which has no
 *   icon-slot indent. @see docs/architecture/databases.md
 */
export type TopLevelBlockAlign = "content-edge" | "title-text";

/** Minimal inset when the block gutter sits beside the row in edit mode. */
const topLevelPageTitleGutterAlignClassName = "pl-1";

export interface TopLevelRowAlignClassNames {
  /** Left inset for `[data-canvas-row-content]`, when the row needs one. */
  contentClassName?: string;
  /** Gutter pull override (see {@link pageCanvasGutterOutsetPullClassName}). */
  gutterPullClassName?: string;
}

export interface TopLevelRowAlignOptions {
  align: TopLevelBlockAlign;
  isNarrowViewport: boolean;
  /** False for container children — the container owns their indent. */
  isTopLevelRow: boolean;
  /** True in edit mode on fine pointers, where the gutter sits beside the row. */
  showGutter: boolean;
  /** True when the content column fills the padded panel (full width / mobile). */
  useFullPanelWidth: boolean;
}

/**
 * Resolves the left-edge chrome for one canvas row. Deliberately mode-agnostic
 * beyond `showGutter` so edit, SSR, and read-only renders resolve identically
 * (no hydration shift).
 *
 * Edit mode on desktop anchors through the gutter lane: the gutter is a flex
 * sibling pulled left, so `title-text` keeps its remainder in the column
 * (`pl-1` beside the grip) while `content-edge` pulls the gutter fully out.
 * Without a gutter (read-only, narrow viewport) only the padding matters.
 */
export function resolveTopLevelRowAlign(
  options: TopLevelRowAlignOptions
): TopLevelRowAlignClassNames {
  const {
    align,
    isNarrowViewport,
    isTopLevelRow,
    showGutter,
    useFullPanelWidth,
  } = options;

  if (!isTopLevelRow) {
    return {};
  }

  const gutterBesideRow = showGutter && !isNarrowViewport;

  if (align === "content-edge") {
    return gutterBesideRow
      ? { gutterPullClassName: pageCanvasGutterOutsetPullClassName }
      : {};
  }

  if (gutterBesideRow) {
    return { contentClassName: topLevelPageTitleGutterAlignClassName };
  }

  // Full-width / mobile: share the page-icon left edge inside scroll padding.
  // Constrained column only: indent to the title text column (`md:pl-9`).
  if (useFullPanelWidth) {
    return {};
  }

  return { contentClassName: pageTitleBlockAlignClassName };
}
