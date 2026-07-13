import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { createPreviewResolutionKeyDownHandler } from "@/lib/dialog/preview-resolution-keys.ts";

function createKeyboardEvent(
  key: string,
  modifiers: Partial<
    Pick<KeyboardEvent<HTMLDivElement>, "metaKey" | "ctrlKey" | "altKey">
  > = {}
): {
  event: KeyboardEvent<HTMLDivElement>;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    altKey: modifiers.altKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    key,
    metaKey: modifiers.metaKey ?? false,
    preventDefault,
    stopPropagation,
  } as unknown as KeyboardEvent<HTMLDivElement>;
  return { event, preventDefault, stopPropagation };
}

describe("createPreviewResolutionKeyDownHandler", () => {
  it("keeps local edits on K", () => {
    const onKeep = vi.fn();
    const onUseSiteVersion = vi.fn();
    const handler = createPreviewResolutionKeyDownHandler({
      onKeep,
      onUseSiteVersion,
    });
    const { event, preventDefault, stopPropagation } = createKeyboardEvent("K");

    handler(event);

    expect(onKeep).toHaveBeenCalledOnce();
    expect(onUseSiteVersion).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("opens confirm on U", () => {
    const onKeep = vi.fn();
    const onUseSiteVersion = vi.fn();
    const handler = createPreviewResolutionKeyDownHandler({
      onKeep,
      onUseSiteVersion,
    });
    const { event, preventDefault, stopPropagation } = createKeyboardEvent("u");

    handler(event);

    expect(onUseSiteVersion).toHaveBeenCalledOnce();
    expect(onKeep).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("does nothing when disabled", () => {
    const onKeep = vi.fn();
    const onUseSiteVersion = vi.fn();
    const handler = createPreviewResolutionKeyDownHandler({
      disabled: true,
      onKeep,
      onUseSiteVersion,
    });
    const { event, preventDefault, stopPropagation } = createKeyboardEvent("K");

    handler(event);

    expect(onKeep).not.toHaveBeenCalled();
    expect(onUseSiteVersion).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("ignores modified keys", () => {
    const onKeep = vi.fn();
    const onUseSiteVersion = vi.fn();
    const handler = createPreviewResolutionKeyDownHandler({
      onKeep,
      onUseSiteVersion,
    });
    const { event, preventDefault, stopPropagation } = createKeyboardEvent(
      "K",
      {
        metaKey: true,
      }
    );

    handler(event);

    expect(onKeep).not.toHaveBeenCalled();
    expect(onUseSiteVersion).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
