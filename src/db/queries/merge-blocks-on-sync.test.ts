import { describe, expect, it } from "vitest";

import { mergeBlocksOnSync } from "@/db/queries/merge-blocks-on-sync.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { toLocalBlock } from "@/lib/schemas/local-block.ts";

const pageId = "page-1";

function textBlock(id: string, text: string): Block {
  return { id, type: "text", props: { text } };
}

describe("mergeBlocksOnSync", () => {
  it("keeps focused block local when remote changes", () => {
    const local = [textBlock("a", "local")];
    const remote = [
      toLocalBlock(
        textBlock("a", "remote"),
        pageId,
        "2020-01-02T00:00:00.000Z"
      ),
    ];
    const localUpdatedAt = new Map([["a", "2020-01-01T00:00:00.000Z"]]);

    const merged = mergeBlocksOnSync(local, localUpdatedAt, remote, "a");

    expect(merged[0]?.type === "text" && merged[0].props.text).toBe("local");
  });

  it("applies newer remote block when not focused", () => {
    const local = [textBlock("a", "local")];
    const remote = [
      toLocalBlock(
        textBlock("a", "remote"),
        pageId,
        "2020-01-02T00:00:00.000Z"
      ),
    ];
    const localUpdatedAt = new Map([["a", "2020-01-01T00:00:00.000Z"]]);

    const merged = mergeBlocksOnSync(local, localUpdatedAt, remote, null);

    expect(merged[0]?.type === "text" && merged[0].props.text).toBe("remote");
  });

  it("keeps local block when local updatedAt is newer", () => {
    const local = [textBlock("a", "local")];
    const remote = [
      toLocalBlock(
        textBlock("a", "remote"),
        pageId,
        "2020-01-01T00:00:00.000Z"
      ),
    ];
    const localUpdatedAt = new Map([["a", "2020-01-02T00:00:00.000Z"]]);

    const merged = mergeBlocksOnSync(local, localUpdatedAt, remote, null);

    expect(merged[0]?.type === "text" && merged[0].props.text).toBe("local");
  });
});
