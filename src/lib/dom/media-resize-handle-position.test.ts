import { describe, expect, it } from "vitest";

import {
  MEDIA_RESIZE_HANDLE_INSET_PX,
  mediaResizeHandlePosition,
} from "@/lib/dom/media-resize-handle-position.ts";

describe("mediaResizeHandlePosition", () => {
  const bounds = { left: 80, top: 15, width: 640, height: 450 };

  it("insets left handle from the content edge and centers vertically", () => {
    expect(mediaResizeHandlePosition("left", bounds)).toEqual({
      left: bounds.left + MEDIA_RESIZE_HANDLE_INSET_PX,
      top: bounds.top + bounds.height / 2,
      transform: "translate(-50%, -50%)",
    });
  });

  it("insets right handle from the content edge", () => {
    expect(mediaResizeHandlePosition("right", bounds)).toEqual({
      left: bounds.left + bounds.width - MEDIA_RESIZE_HANDLE_INSET_PX,
      top: bounds.top + bounds.height / 2,
      transform: "translate(-50%, -50%)",
    });
  });
});
