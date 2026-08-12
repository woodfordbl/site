/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Chip,
  ChipButton,
  ChipSegment,
  TokenChip,
} from "@/components/ui/chip.tsx";

afterEach(cleanup);

const WHITESPACE = /\s+/;

/** Order-insensitive class comparison — cn may reorder but not drop tokens. */
function classTokens(element: Element | null): Set<string> {
  if (!element) {
    throw new Error("expected a rendered element");
  }
  return new Set(element.className.split(WHITESPACE).filter(Boolean));
}

function tokenSet(classes: string): Set<string> {
  return new Set(classes.split(WHITESPACE).filter(Boolean));
}

// The exact class strings the database filter bar hand-rolled before the
// extraction (`database-filter-bar.tsx`) — the primitives must reproduce them
// token-for-token so the refactor is a zero-visual-change move.
const LEGACY_CHIP_CLASS =
  "flex h-6 shrink-0 items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-background text-xs pointer-coarse:h-8";

const LEGACY_SEGMENT_CLASS =
  "flex items-center gap-1 px-1.5 text-muted-foreground outline-none transition-colors pointer-coarse:px-2";

const LEGACY_BUTTON_CLASS = `${LEGACY_SEGMENT_CLASS} hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground`;

const LEGACY_ADD_CHIP_CLASS =
  "flex h-6 pointer-coarse:h-8 shrink-0 items-center gap-1 rounded-md border border-border border-dashed pointer-coarse:px-2 px-1.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground";

const LEGACY_ADD_FULL_WIDTH_CLASS =
  "flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border border-dashed px-2 text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground";

describe("Chip", () => {
  it("default variant reproduces the filter-bar chip container classes", () => {
    const { container } = render(<Chip>chip</Chip>);
    const chip = container.firstElementChild;
    expect(chip?.tagName).toBe("DIV");
    expect(classTokens(chip)).toEqual(tokenSet(LEGACY_CHIP_CLASS));
  });

  it("dashed variant reproduces the small add-chip trigger classes", () => {
    const { container } = render(
      <Chip render={<button type="button" />} variant="dashed">
        Filter
      </Chip>
    );
    const chip = container.firstElementChild;
    // `render` swaps the tag so the chip can act as a popover trigger button.
    expect(chip?.tagName).toBe("BUTTON");
    expect(chip?.getAttribute("type")).toBe("button");
    expect(classTokens(chip)).toEqual(tokenSet(LEGACY_ADD_CHIP_CLASS));
  });

  it("dashed-wide variant reproduces the full-width drawer add trigger", () => {
    const { container } = render(<Chip variant="dashed-wide">Add sort</Chip>);
    expect(classTokens(container.firstElementChild)).toEqual(
      tokenSet(LEGACY_ADD_FULL_WIDTH_CLASS)
    );
  });
});

describe("ChipSegment / ChipButton", () => {
  it("segment reproduces the static segment classes", () => {
    const { container } = render(<ChipSegment>Name</ChipSegment>);
    const segment = container.firstElementChild;
    expect(segment?.tagName).toBe("SPAN");
    expect(classTokens(segment)).toEqual(tokenSet(LEGACY_SEGMENT_CLASS));
  });

  it("button adds the interactive hover/focus classes and type=button", () => {
    const { container } = render(<ChipButton>Value</ChipButton>);
    const button = container.firstElementChild;
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("type")).toBe("button");
    expect(classTokens(button)).toEqual(tokenSet(LEGACY_BUTTON_CLASS));
  });

  it("button lets callers narrow padding (the trailing × segments)", () => {
    const { container } = render(
      <ChipButton aria-label="Remove" className="px-1" />
    );
    const tokens = classTokens(container.firstElementChild);
    expect(tokens.has("px-1")).toBe(true);
    // tailwind-merge drops the conflicting default, keeps the coarse bump.
    expect(tokens.has("px-1.5")).toBe(false);
    expect(tokens.has("pointer-coarse:px-2")).toBe(true);
  });
});

describe("TokenChip", () => {
  it("neutral tone renders the canonical inline token look", () => {
    const { container } = render(<TokenChip>Price</TokenChip>);
    const token = container.firstElementChild;
    expect(token?.tagName).toBe("SPAN");
    expect(classTokens(token)).toEqual(
      tokenSet(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs bg-muted text-foreground"
      )
    );
  });

  it.each([
    ["blue", "bg-(--block-bg-blue)", "text-(--block-text-blue)"],
    ["purple", "bg-(--block-bg-purple)", "text-(--block-text-purple)"],
    ["destructive", "bg-destructive/10", "text-destructive"],
  ] as const)("%s tone maps to its color tokens", (tone, bg, text) => {
    const { container } = render(<TokenChip tone={tone}>ref</TokenChip>);
    const tokens = classTokens(container.firstElementChild);
    expect(tokens.has(bg)).toBe(true);
    expect(tokens.has(text)).toBe(true);
    expect(tokens.has("bg-muted")).toBe(false);
  });
});
