import { describe, expect, it } from "vitest";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  coerceContainerChildBlocks,
  ensureTabMinimumChildren,
} from "@/lib/blocks/normalize-block.ts";

describe("tabs normalize", () => {
  it("coerces non-tab children of tabs to tab type", () => {
    const tabs = createEmptyBlock("tabs");
    tabs.id = "tabs";
    const wrongChild = createEmptyBlock("text");
    wrongChild.id = "bad";
    wrongChild.parentId = "tabs";

    const result = coerceContainerChildBlocks([tabs, wrongChild]);
    const child = result.find((b) => b.id === "bad");
    expect(child?.type).toBe("tab");
  });

  it("seeds empty text when a tab has no children", () => {
    const tabs = createEmptyBlock("tabs");
    tabs.id = "tabs";
    const tab = createEmptyBlock("tab");
    tab.id = "tab";
    tab.parentId = "tabs";

    const result = ensureTabMinimumChildren([tabs, tab]);
    const seeded = result.find((b) => b.parentId === "tab");
    expect(seeded?.type).toBe("text");
  });
});
