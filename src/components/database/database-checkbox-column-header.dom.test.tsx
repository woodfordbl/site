/** @vitest-environment jsdom */

import { IconSquareCheck } from "@tabler/icons-react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DatabaseColumnHeaderLabel,
  databaseColumnHeaderAlignClass,
} from "@/components/database/database-column-header-label.tsx";
import {
  CHECKBOX_COLUMN_WIDTH_PX,
  DEFAULT_COLUMN_WIDTH_PX,
  defaultColumnWidthPx,
  isCheckboxColumnHeaderCompact,
  MIN_COLUMN_WIDTH_PX,
  minColumnWidthPx,
} from "@/components/database/database-grid-helpers.ts";
import { cn } from "@/lib/utils.ts";

afterEach(() => {
  cleanup();
});

describe("checkbox column header label", () => {
  it("renders the type icon and property name at ordinary widths", () => {
    const compact = isCheckboxColumnHeaderCompact(DEFAULT_COLUMN_WIDTH_PX);
    render(
      <button
        className={cn(databaseColumnHeaderAlignClass(compact), "text-left")}
        type="button"
      >
        <DatabaseColumnHeaderLabel
          compact={compact}
          Icon={IconSquareCheck}
          name="Done"
        />
      </button>
    );
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toContain("Done");
    expect(trigger.className.includes("justify-center")).toBe(false);
  });

  it("renders the type icon only at the compact minimum width", () => {
    const compact = isCheckboxColumnHeaderCompact(CHECKBOX_COLUMN_WIDTH_PX);
    render(
      <button
        className={cn(databaseColumnHeaderAlignClass(compact), "text-left")}
        type="button"
      >
        <DatabaseColumnHeaderLabel
          compact={compact}
          Icon={IconSquareCheck}
          name="Done"
        />
      </button>
    );
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).not.toContain("Done");
    expect(trigger.className.includes("justify-center")).toBe(true);
    expect(trigger.className.includes("px-1")).toBe(true);
    expect(trigger.className.includes("px-2")).toBe(false);
  });

  it("keeps ordinary-width headers on standard horizontal padding", () => {
    const compact = isCheckboxColumnHeaderCompact(DEFAULT_COLUMN_WIDTH_PX);
    expect(databaseColumnHeaderAlignClass(compact)).toContain("px-2");
    expect(databaseColumnHeaderAlignClass(compact)).not.toContain("px-1");
  });

  it("keeps checkbox min width compact and other field floors unchanged", () => {
    expect(CHECKBOX_COLUMN_WIDTH_PX).toBe(32);
    expect(minColumnWidthPx({ type: "checkbox" })).toBe(
      CHECKBOX_COLUMN_WIDTH_PX
    );
    expect(defaultColumnWidthPx({ type: "checkbox" })).toBe(
      DEFAULT_COLUMN_WIDTH_PX
    );
    expect(minColumnWidthPx({ type: "text" })).toBe(MIN_COLUMN_WIDTH_PX);
    expect(defaultColumnWidthPx({ type: "text" })).toBe(
      DEFAULT_COLUMN_WIDTH_PX
    );
  });
});
