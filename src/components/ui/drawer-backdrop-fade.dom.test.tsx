/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Drawer, DrawerContent } from "@/components/ui/drawer.tsx";

afterEach(cleanup);

/** Lets a MutationObserver callback (a microtask) run before we assert. */
function flushObserver(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getContent(): HTMLElement {
  const node = document.querySelector<HTMLElement>(
    '[data-slot="drawer-content"]'
  );
  if (!node) {
    throw new Error("drawer content not found");
  }
  return node;
}

describe("nested drawer backdrop fade", () => {
  // vaul scales a parent drawer back when a nested drawer opens on top of it,
  // writing the scale straight onto the element's inline `transform`. We mirror
  // that live scale onto opacity; here we play vaul's role and mutate the
  // transform to confirm the fade follows through every phase.
  it("fades from opaque to the floor scale as vaul scales the parent back", async () => {
    // Fully-nested scale is (innerWidth - 16) / innerWidth; pin innerWidth so
    // the arithmetic is exact.
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1000,
    });
    const nestedScale = (1000 - 16) / 1000; // 0.984

    render(
      <Drawer open>
        <DrawerContent hasTitle={false}>content</DrawerContent>
      </Drawer>
    );

    const content = getContent();
    // At rest (no scale) the drawer is fully opaque.
    expect(content.style.opacity).toBe("");

    // vaul, on nested open: eased scale to the fully-nested value.
    content.style.transition = "transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
    content.style.transform = `scale(${nestedScale}) translate3d(0, -16px, 0)`;
    await flushObserver();
    expect(Number(content.style.opacity)).toBeCloseTo(0.6, 2);
    // Opacity gets the matching transition so it moves with the scale.
    expect(content.style.transition).toContain("opacity");

    // vaul, mid drag-to-close (transition: none): scale part-way back. Opacity
    // must track the finger 1:1 — no transition, and a proportional value.
    const halfScale = 1 - (1 - nestedScale) / 2;
    content.style.transition = "none";
    content.style.transform = `scale(${halfScale}) translate3d(0, -8px, 0)`;
    await flushObserver();
    expect(Number(content.style.opacity)).toBeCloseTo(0.8, 2);
    expect(content.style.transition).toBe("none");

    // vaul, on close: scale back to rest. The drawer returns to fully opaque.
    content.style.transition = "transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
    content.style.transform = "scale(1) translate3d(0, 0, 0)";
    await flushObserver();
    expect(content.style.opacity).toBe("");
  });
});
