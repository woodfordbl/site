import { describe, expect, it } from "vitest";

/** Mirrors bootstrap retention in usePageBlocks when live query is ready but empty. */
function resolveExistingLocalBlocks(
  bootstrapBlocks: unknown[],
  liveLocalBlocks: unknown[],
  localBlocksReady: boolean
): unknown[] {
  if (!localBlocksReady) {
    return bootstrapBlocks;
  }

  return liveLocalBlocks.length > 0 ? liveLocalBlocks : bootstrapBlocks;
}

describe("usePageBlocks bootstrap retention", () => {
  it("keeps bootstrap blocks when live query is ready but empty", () => {
    const bootstrap = [{ id: "b1" }];
    expect(resolveExistingLocalBlocks(bootstrap, [], true)).toEqual(bootstrap);
  });

  it("uses live blocks when populated", () => {
    const live = [{ id: "b2" }];
    expect(resolveExistingLocalBlocks([{ id: "b1" }], live, true)).toEqual(
      live
    );
  });
});
