import { afterEach, describe, expect, it } from "vitest";

import {
  clearAllPageEditHistories,
  clearPageEditHistory,
  EDIT_HISTORY_COALESCE_MS,
  MAX_EDIT_HISTORY_ENTRIES,
  popPageRedoEntry,
  popPageUndoEntry,
  recordPageEditHistory,
} from "@/lib/canvas/page-edit-history.ts";
import type { Block } from "@/lib/schemas/block.ts";

function textBlock(id: string, text: string): Block {
  return { id, type: "text", props: { text } } as Block;
}

const PAGE = "page-1";

afterEach(() => {
  clearAllPageEditHistories();
});

describe("recordPageEditHistory / popPageUndoEntry", () => {
  it("undoes back through recorded before-states", () => {
    const v1 = [textBlock("a", "one")];
    const v2 = [textBlock("a", "two")];
    const v3 = [textBlock("a", "three")];

    recordPageEditHistory(PAGE, v1, { nowMs: 0 });
    recordPageEditHistory(PAGE, v2, { nowMs: 5000 });

    expect(popPageUndoEntry(PAGE, v3)?.blocks).toBe(v2);
    expect(popPageUndoEntry(PAGE, v2)?.blocks).toBe(v1);
    expect(popPageUndoEntry(PAGE, v1)).toBeNull();
  });

  it("coalesces same-key typing bursts within the window", () => {
    const v1 = [textBlock("a", "h")];
    const v2 = [textBlock("a", "he")];
    const v3 = [textBlock("a", "hey")];

    recordPageEditHistory(PAGE, v1, { coalesceKey: "row.update:a", nowMs: 0 });
    recordPageEditHistory(PAGE, v2, {
      coalesceKey: "row.update:a",
      nowMs: 200,
    });
    recordPageEditHistory(PAGE, v3, {
      coalesceKey: "row.update:a",
      nowMs: 400,
    });

    // The whole burst is one entry holding the first before-state.
    expect(popPageUndoEntry(PAGE, v3)?.blocks).toBe(v1);
    expect(popPageUndoEntry(PAGE, v1)).toBeNull();
  });

  it("keeps a burst alive while keystrokes stay within the window of each other", () => {
    const states = [0, 1, 2, 3].map((i) => [textBlock("a", "x".repeat(i + 1))]);
    const step = EDIT_HISTORY_COALESCE_MS - 100;

    states.forEach((blocks, i) => {
      recordPageEditHistory(PAGE, blocks, {
        coalesceKey: "row.update:a",
        nowMs: i * step,
      });
    });

    // Total span exceeds the window but no gap does — still one entry.
    expect(popPageUndoEntry(PAGE, states[3])?.blocks).toBe(states[0]);
    expect(popPageUndoEntry(PAGE, states[0])).toBeNull();
  });

  it("starts a new entry after a pause, a different key, or a keyless edit", () => {
    const v1 = [textBlock("a", "1")];
    const v2 = [textBlock("a", "2")];
    const v3 = [textBlock("a", "3")];
    const v4 = [textBlock("a", "4")];

    recordPageEditHistory(PAGE, v1, { coalesceKey: "row.update:a", nowMs: 0 });
    // Pause longer than the window → new entry despite the same key.
    recordPageEditHistory(PAGE, v2, {
      coalesceKey: "row.update:a",
      nowMs: EDIT_HISTORY_COALESCE_MS + 1,
    });
    // Different block → new entry.
    recordPageEditHistory(PAGE, v3, {
      coalesceKey: "row.update:b",
      nowMs: EDIT_HISTORY_COALESCE_MS + 2,
    });
    // Structural edit (no key) never coalesces.
    recordPageEditHistory(PAGE, v4, {
      nowMs: EDIT_HISTORY_COALESCE_MS + 3,
    });

    expect(popPageUndoEntry(PAGE, v4)?.blocks).toBe(v4);
    expect(popPageUndoEntry(PAGE, v4)?.blocks).toBe(v3);
    expect(popPageUndoEntry(PAGE, v3)?.blocks).toBe(v2);
    expect(popPageUndoEntry(PAGE, v2)?.blocks).toBe(v1);
  });

  it("caps the undo stack, dropping the oldest entries", () => {
    for (let i = 0; i < MAX_EDIT_HISTORY_ENTRIES + 10; i += 1) {
      recordPageEditHistory(PAGE, [textBlock("a", String(i))], {
        nowMs: i * 10_000,
      });
    }

    let popped = 0;
    let last: Block[] | undefined;
    for (;;) {
      const entry = popPageUndoEntry(PAGE, []);
      if (!entry) {
        break;
      }
      popped += 1;
      last = entry.blocks;
    }

    expect(popped).toBe(MAX_EDIT_HISTORY_ENTRIES);
    // Oldest surviving entry is #10 — entries 0–9 were dropped.
    expect(last?.[0]).toMatchObject({ props: { text: "10" } });
  });

  it("keeps pages independent", () => {
    const a = [textBlock("a", "a")];
    const b = [textBlock("b", "b")];

    recordPageEditHistory("page-a", a, { nowMs: 0 });
    recordPageEditHistory("page-b", b, { nowMs: 0 });

    expect(popPageUndoEntry("page-a", [])?.blocks).toBe(a);
    expect(popPageUndoEntry("page-a", [])).toBeNull();
    expect(popPageUndoEntry("page-b", [])?.blocks).toBe(b);
  });
});

describe("redo", () => {
  it("replays undone steps and survives round-trips", () => {
    const v1 = [textBlock("a", "one")];
    const v2 = [textBlock("a", "two")];

    recordPageEditHistory(PAGE, v1, { nowMs: 0 });

    expect(popPageUndoEntry(PAGE, v2)?.blocks).toBe(v1);
    expect(popPageRedoEntry(PAGE, v1)?.blocks).toBe(v2);
    // Redo pushed v1 back onto undo — a second undo works again.
    expect(popPageUndoEntry(PAGE, v2)?.blocks).toBe(v1);
  });

  it("clears redo when a new edit is recorded", () => {
    const v1 = [textBlock("a", "one")];
    const v2 = [textBlock("a", "two")];
    const v3 = [textBlock("a", "three")];

    recordPageEditHistory(PAGE, v1, { nowMs: 0 });
    popPageUndoEntry(PAGE, v2);
    recordPageEditHistory(PAGE, v3, { nowMs: 10_000 });

    expect(popPageRedoEntry(PAGE, v3)).toBeNull();
  });

  it("breaks typing coalescing across an undo", () => {
    const v1 = [textBlock("a", "h")];
    const v2 = [textBlock("a", "he")];
    const v3 = [textBlock("a", "hex")];

    recordPageEditHistory(PAGE, v1, { coalesceKey: "row.update:a", nowMs: 0 });
    popPageUndoEntry(PAGE, v2);
    // Same key, still inside the window — must NOT merge into the popped burst.
    recordPageEditHistory(PAGE, v1, {
      coalesceKey: "row.update:a",
      nowMs: 100,
    });

    expect(popPageUndoEntry(PAGE, v3)?.blocks).toBe(v1);
  });
});

describe("clearing", () => {
  it("clearPageEditHistory drops one page's stacks", () => {
    recordPageEditHistory(PAGE, [textBlock("a", "x")], { nowMs: 0 });
    recordPageEditHistory("other", [textBlock("b", "y")], { nowMs: 0 });

    clearPageEditHistory(PAGE);

    expect(popPageUndoEntry(PAGE, [])).toBeNull();
    expect(popPageUndoEntry("other", [])).not.toBeNull();
  });

  it("clearAllPageEditHistories drops everything", () => {
    recordPageEditHistory(PAGE, [textBlock("a", "x")], { nowMs: 0 });
    clearAllPageEditHistories();
    expect(popPageUndoEntry(PAGE, [])).toBeNull();
  });
});
