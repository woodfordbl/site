import { describe, expect, it } from "vitest";

import { withoutWidthClasses } from "@/components/ui/menu-presentation.tsx";

describe("withoutWidthClasses", () => {
  it("returns undefined for empty input", () => {
    expect(withoutWidthClasses()).toBeUndefined();
    expect(withoutWidthClasses("")).toBeUndefined();
  });

  it("drops width utilities so content fills the full-width drawer", () => {
    expect(withoutWidthClasses("w-72 gap-0 p-0")).toBe("gap-0 p-0");
    expect(withoutWidthClasses("w-[352px] flex-col")).toBe("flex-col");
    expect(withoutWidthClasses("min-w-56 w-56 text-sm")).toBe("text-sm");
    expect(withoutWidthClasses("max-w-sm rounded-lg")).toBe("rounded-lg");
  });

  it("keeps classes that merely start with a w-like prefix", () => {
    // `whitespace-*` and `will-change-*` must not be mistaken for widths.
    expect(withoutWidthClasses("whitespace-nowrap will-change-transform")).toBe(
      "whitespace-nowrap will-change-transform"
    );
  });

  it("preserves non-width classes unchanged", () => {
    expect(withoutWidthClasses("flex flex-col gap-2")).toBe(
      "flex flex-col gap-2"
    );
  });
});
