import { describe, expect, it } from "vitest";

import {
  caretTokenPickerKeyAction,
  stepCaretTokenHighlight,
} from "@/lib/editor/caret-token-trigger.ts";

describe("caretTokenPickerKeyAction", () => {
  it("maps navigation keys", () => {
    expect(caretTokenPickerKeyAction("Escape")).toBe("close");
    expect(caretTokenPickerKeyAction("Enter")).toBe("confirm");
    expect(caretTokenPickerKeyAction("Tab")).toBe("confirm");
    expect(caretTokenPickerKeyAction("ArrowDown")).toBe("down");
    expect(caretTokenPickerKeyAction("ArrowUp")).toBe("up");
    expect(caretTokenPickerKeyAction("a")).toBeNull();
  });
});

describe("stepCaretTokenHighlight", () => {
  const options = [{ key: "a" }, { key: "b" }, { key: "c" }];

  it("wraps through the list", () => {
    expect(stepCaretTokenHighlight(options, options[0], "down")?.key).toBe("b");
    expect(stepCaretTokenHighlight(options, options[2], "down")?.key).toBe("a");
    expect(stepCaretTokenHighlight(options, options[0], "up")?.key).toBe("c");
  });
});
