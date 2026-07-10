import { describe, expect, it } from "vitest";

import { mergePageBlocks } from "@/lib/pages/merge-page-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";

function text(id: string, value = id): Block {
  return { id, type: "text", props: { text: value } };
}

function ids(blocks: Block[]): string[] {
  return blocks.map((block) => block.id);
}

function textOf(blocks: Block[], id: string): string | undefined {
  const block = blocks.find((item) => item.id === id);
  return block && "text" in block.props
    ? (block.props.text as string)
    : undefined;
}

describe("mergePageBlocks content resolution", () => {
  it("takes a remote edit when the block is locally untouched", () => {
    const base = [text("a"), text("b")];
    const local = [text("a"), text("b")];
    const remote = [text("a", "a v2"), text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(textOf(result.merged, "a")).toBe("a v2");
    expect(result.conflictBlockIds).toEqual([]);
    expect(result.tookRemote).toBe(1);
    expect(result.changed).toBe(true);
  });

  it("keeps a local edit when the block is remotely untouched", () => {
    const base = [text("a"), text("b")];
    const local = [text("a", "my edit"), text("b")];
    const remote = [text("a"), text("b", "their edit")];

    const result = mergePageBlocks(base, local, remote);

    expect(textOf(result.merged, "a")).toBe("my edit");
    expect(textOf(result.merged, "b")).toBe("their edit");
    expect(result.conflictBlockIds).toEqual([]);
  });

  it("resolves divergent edits to local and flags the conflict", () => {
    const base = [text("a")];
    const local = [text("a", "mine")];
    const remote = [text("a", "theirs")];

    const result = mergePageBlocks(base, local, remote);

    expect(textOf(result.merged, "a")).toBe("mine");
    expect(result.conflictBlockIds).toEqual(["a"]);
    expect(result.changed).toBe(false);
  });

  it("merges identical edits without a conflict", () => {
    const base = [text("a")];
    const local = [text("a", "same")];
    const remote = [text("a", "same")];

    const result = mergePageBlocks(base, local, remote);

    expect(textOf(result.merged, "a")).toBe("same");
    expect(result.conflictBlockIds).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("takes a remote addition", () => {
    const base = [text("a")];
    const local = [text("a")];
    const remote = [text("a"), text("new")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["a", "new"]);
    expect(result.tookRemote).toBe(1);
  });

  it("keeps a local addition alongside remote changes", () => {
    const base = [text("a")];
    const local = [text("a"), text("mine")];
    const remote = [text("a", "a v2")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["a", "mine"]);
    expect(textOf(result.merged, "a")).toBe("a v2");
  });

  it("applies a remote deletion of a locally-untouched block", () => {
    const base = [text("a"), text("b")];
    const local = [text("a"), text("b")];
    const remote = [text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["b"]);
    expect(result.conflictBlockIds).toEqual([]);
    expect(result.tookRemote).toBe(1);
  });

  it("keeps a locally-edited block that remote deleted, flagged", () => {
    const base = [text("a"), text("b")];
    const local = [text("a", "edited"), text("b")];
    const remote = [text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["a", "b"]);
    expect(textOf(result.merged, "a")).toBe("edited");
    expect(result.conflictBlockIds).toEqual(["a"]);
  });

  it("keeps a local deletion of a remotely-untouched block", () => {
    const base = [text("a"), text("b")];
    const local = [text("b")];
    const remote = [text("a"), text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["b"]);
    expect(result.conflictBlockIds).toEqual([]);
  });

  it("keeps a local deletion of a remotely-edited block, flagged", () => {
    const base = [text("a"), text("b")];
    const local = [text("b")];
    const remote = [text("a", "a v2"), text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["b"]);
    expect(result.conflictBlockIds).toEqual(["a"]);
  });

  it("drops a block deleted on both sides", () => {
    const base = [text("a"), text("b")];
    const local = [text("b")];
    const remote = [text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["b"]);
    expect(result.conflictBlockIds).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("treats a parentId change as an edit (remote move of untouched block wins)", () => {
    const base = [text("wrap"), text("a")];
    const local = [text("wrap"), text("a")];
    const moved: Block = { ...text("a"), parentId: "wrap" };
    const remote = [text("wrap"), moved];

    const result = mergePageBlocks(base, local, remote);

    const mergedA = result.merged.find((block) => block.id === "a");
    expect(mergedA?.parentId).toBe("wrap");
    expect(result.conflictBlockIds).toEqual([]);
  });
});

describe("mergePageBlocks ordering", () => {
  it("adopts the remote order when local never reordered", () => {
    const base = [text("a"), text("b"), text("c")];
    const local = [text("a", "edited"), text("b"), text("c")];
    const remote = [text("c"), text("a"), text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["c", "a", "b"]);
    expect(textOf(result.merged, "a")).toBe("edited");
  });

  it("keeps the local order when local reordered", () => {
    const base = [text("a"), text("b"), text("c")];
    const local = [text("c"), text("b"), text("a")];
    const remote = [text("a", "a v2"), text("b"), text("c")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["c", "b", "a"]);
    expect(textOf(result.merged, "a")).toBe("a v2");
  });

  it("splices a remote addition after its remote predecessor in a local spine", () => {
    const base = [text("a"), text("b"), text("c")];
    // Local reordered, so local order is the spine.
    const local = [text("c"), text("a"), text("b")];
    const remote = [text("a"), text("new"), text("b"), text("c")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["c", "a", "new", "b"]);
  });

  it("keeps a run of consecutive remote additions in order", () => {
    const base = [text("a"), text("b")];
    const local = [text("b"), text("a")]; // local spine
    const remote = [text("a"), text("n1"), text("n2"), text("n3"), text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(ids(result.merged)).toEqual(["b", "a", "n1", "n2", "n3"]);
  });

  it("inserts a remote addition with no surviving predecessor at the start", () => {
    const base = [text("a")];
    const local = [text("x"), text("a")]; // local added x first → local reordered? no: shared sequence unchanged
    const remote = [text("new"), text("a")];

    const result = mergePageBlocks(base, local, remote);

    // Local kept base's shared order, so remote is the spine: new, a — then
    // the local addition x splices after its local predecessor (none → start).
    expect(ids(result.merged)).toContain("x");
    expect(ids(result.merged)).toContain("new");
    expect(ids(result.merged)).toContain("a");
    expect(ids(result.merged).indexOf("new")).toBeLessThan(
      ids(result.merged).indexOf("a")
    );
  });

  it("reports changed=false when the merge is a no-op", () => {
    const base = [text("a"), text("b")];
    const local = [text("a", "edited"), text("b")];
    const remote = [text("a"), text("b")];

    const result = mergePageBlocks(base, local, remote);

    expect(result.changed).toBe(false);
    expect(ids(result.merged)).toEqual(["a", "b"]);
  });

  it("merges disjoint edits, adds, deletes, and a remote reorder together", () => {
    const base = [text("a"), text("b"), text("c"), text("d")];
    const local = [
      text("a", "local edit"),
      text("b"),
      text("c"),
      text("d"),
      text("local-add"),
    ];
    const remote = [
      text("d"), // remote moved d first
      text("a"),
      text("remote-add"),
      text("c", "remote edit"),
      // b deleted remotely
    ];

    const result = mergePageBlocks(base, local, remote);

    // local-add anchors to its local predecessor (d) — the predecessor moved
    // to the front remotely and the addition follows it (locality rule).
    expect(ids(result.merged)).toEqual([
      "d",
      "local-add",
      "a",
      "remote-add",
      "c",
    ]);
    expect(textOf(result.merged, "a")).toBe("local edit");
    expect(textOf(result.merged, "c")).toBe("remote edit");
    expect(result.conflictBlockIds).toEqual([]);
    expect(result.changed).toBe(true);
  });
});
