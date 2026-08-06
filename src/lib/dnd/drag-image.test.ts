// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveDragPreviewOffset,
  setClonedDragImage,
} from "@/lib/dnd/drag-image.ts";

function stubRect(node: HTMLElement, rect: Partial<DOMRect>): void {
  node.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
}

function hotspotFor(
  node: HTMLElement,
  pointer: { x: number; y: number }
): { x: number; y: number } {
  const setDragImage = vi.fn();
  const event = {
    clientX: pointer.x,
    clientY: pointer.y,
    dataTransfer: { setDragImage },
  } as unknown as DragEvent;

  setClonedDragImage(event, node);

  const [, hotspotX, hotspotY] = setDragImage.mock.calls[0];
  return { x: hotspotX, y: hotspotY };
}

describe("setClonedDragImage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("puts the grab point on the source's own rect", () => {
    const node = document.createElement("div");
    stubRect(node, { left: 100, top: 50, width: 400, height: 80 });
    document.body.appendChild(node);

    expect(hotspotFor(node, { x: 140, y: 60 })).toEqual({ x: 40, y: 10 });
  });

  it("keeps a negative hotspot when the grab handle sits outside the row", () => {
    const node = document.createElement("div");
    stubRect(node, { left: 100, top: 50, width: 400, height: 80 });
    document.body.appendChild(node);

    // Gutter grip, 28px left of the row content: the ghost draws over the row.
    expect(hotspotFor(node, { x: 72, y: 58 })).toEqual({ x: -28, y: 8 });
  });

  it("copies live field values into the clone", () => {
    const node = document.createElement("div");
    const field = document.createElement("textarea");
    field.setAttribute("data-canvas-field", "");
    field.value = "typed after render";
    node.appendChild(field);
    document.body.appendChild(node);

    hotspotFor(node, { x: 0, y: 0 });

    const clone = document.body.lastElementChild as HTMLElement;
    expect(clone.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "typed after render"
    );
  });
});

describe("resolveDragPreviewOffset", () => {
  const previewRect = { height: 320, left: -10_000, top: -10_000, width: 656 };

  it("anchors and clamps a detached preview", () => {
    expect(
      resolveDragPreviewOffset({ x: 1400, y: 900 }, previewRect, {
        clamp: true,
        origin: { left: 192, top: 112 },
      })
    ).toEqual({ x: 656, y: 320 });
  });

  it("preserves a negative gutter hotspot", () => {
    expect(
      resolveDragPreviewOffset({ x: 172, y: 130 }, previewRect, {
        clamp: true,
        origin: { left: 192, top: 112 },
      })
    ).toEqual({ x: -20, y: 18 });
  });
});
