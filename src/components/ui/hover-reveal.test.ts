import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REVEAL_DELAY_DELAYED_MS,
  REVEAL_DELAY_MS,
  REVEAL_DURATION_MS,
  revealGroupProps,
} from "@/components/ui/hover-reveal.ts";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("revealGroupProps", () => {
  it("marks the container and applies the default timing", () => {
    const props = revealGroupProps();
    expect(props["data-reveal-group"]).toBe("");
    expect(props.style).toMatchObject({
      "--reveal-duration": "150ms",
      "--reveal-delay": "0ms",
    });
  });

  it("overrides duration and delay per instance", () => {
    expect(revealGroupProps({ duration: 0 }).style).toMatchObject({
      "--reveal-duration": "0ms",
      "--reveal-delay": "0ms",
    });
    expect(
      revealGroupProps({ delay: REVEAL_DELAY_DELAYED_MS }).style
    ).toMatchObject({
      "--reveal-duration": "150ms",
      "--reveal-delay": "300ms",
    });
  });

  it("exposes the documented default constants", () => {
    expect(REVEAL_DURATION_MS).toBe(150);
    expect(REVEAL_DELAY_MS).toBe(0);
    expect(REVEAL_DELAY_DELAYED_MS).toBe(300);
  });
});

describe("hover-reveal stylesheet", () => {
  const css = read("src/styles.css");

  it("defines the reveal/swap primitive and timing custom properties", () => {
    expect(css).toContain(".hover-reveal");
    expect(css).toContain(".swap-reveal");
    expect(css).toContain(".swap-conceal");
    expect(css).toContain("[data-reveal-group]");
    expect(css).toContain("var(--reveal-duration, 150ms)");
    expect(css).toContain("var(--reveal-delay, 0ms)");
  });

  it("keeps simple reveals visible on touch and respects reduced motion", () => {
    expect(css).toContain("@media (hover: none)");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the gutter grip reachable and hides the insert button on touch", () => {
    expect(css).toContain(".canvas-block-gutter");
    expect(css).toContain("[data-gutter-insert]");
  });
});

describe("hover-reveal standardization", () => {
  // Every converted site should use the shared classes and drop the bespoke
  // opacity/transition strings that previously diverged across the app.
  const cases: Array<{
    file: string;
    contains: string[];
    absent: string[];
  }> = [
    {
      file: "src/components/pages/page-list-item.tsx",
      contains: ["swap-conceal", "swap-reveal", 'data-reveal-group=""'],
      absent: ["transition-opacity duration-100"],
    },
    {
      file: "src/components/pages/page-list-row-menu.tsx",
      contains: ["hover-reveal"],
      absent: ["group-hover/page-row:opacity-100", "md:opacity-0"],
    },
    {
      file: "src/components/blocks/types/media/media-hover-toolbar.tsx",
      contains: ["hover-reveal"],
      absent: ["opacity-0 transition-opacity duration-150"],
    },
    {
      file: "src/components/blocks/types/media/media-frame.tsx",
      contains: ["hover-reveal", 'data-reveal-group=""'],
      absent: ["opacity-0 transition-opacity duration-150"],
    },
    {
      // Only the outer reveal is standardized; the inner grip-visual crossfade
      // (muted dot ↔ grip box) intentionally keeps its own instant transitions.
      file: "src/components/blocks/types/table/table-structure-handle.tsx",
      contains: ["hover-reveal", '"--reveal-duration": "0ms"'],
      absent: [],
    },
    {
      file: "src/components/blocks/types/table/table-controls.tsx",
      contains: ["hover-reveal"],
      absent: ["opacity-0 transition-opacity"],
    },
    {
      file: "src/components/blocks/types/columns/columns-resize-zone.tsx",
      contains: [
        "hover-reveal",
        'data-reveal-group=""',
        "REVEAL_DELAY_DELAYED_MS",
      ],
      absent: ["delay-300", "ease-in-out"],
    },
    {
      file: "src/components/canvas/block-gutter.tsx",
      contains: ["data-gutter-insert"],
      absent: [],
    },
  ];

  for (const { file, contains, absent } of cases) {
    it(`standardizes ${file}`, () => {
      const source = read(file);
      for (const needle of contains) {
        expect(source, `${file} should contain "${needle}"`).toContain(needle);
      }
      for (const needle of absent) {
        expect(
          source,
          `${file} should no longer contain "${needle}"`
        ).not.toContain(needle);
      }
    });
  }
});
