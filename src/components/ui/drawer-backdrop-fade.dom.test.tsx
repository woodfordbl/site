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

/** The black scrim whose opacity carries the dim. */
function getScrim(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-slot="drawer-dim"]');
  if (!node) {
    throw new Error("drawer dim scrim not found");
  }
  return node;
}

describe("nested drawer backdrop dim", () => {
  // vaul scales a parent drawer back when a nested drawer opens on top of it,
  // writing the scale straight onto the content's inline `transform`. We mirror
  // that live scale onto the opacity of a black scrim (same color as the drawer
  // overlay) so the background drawer darkens rather than turning transparent;
  // here we play vaul's role and mutate the transform to confirm the dim
  // follows through every phase.
  it("dims a black scrim in step with vaul scaling the parent back", async () => {
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
    const scrim = getScrim();
    // At rest (no scale) the scrim is clear; the drawer itself is untouched.
    expect(scrim.style.opacity).toBe("");
    expect(content.style.opacity).toBe("");
    expect(content.style.filter).toBe("");

    // vaul, on nested open: eased scale to the fully-nested value. The scrim
    // reaches the overlay's black strength (0.2) with the matching transition.
    content.style.transition = "transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
    content.style.transform = `scale(${nestedScale}) translate3d(0, -16px, 0)`;
    await flushObserver();
    expect(Number(scrim.style.opacity)).toBeCloseTo(0.2, 2);
    expect(scrim.style.transition).toContain("opacity");
    // The drawer darkens without going transparent.
    expect(content.style.opacity).toBe("");

    // vaul, mid drag-to-close (transition: none): scale part-way back. The dim
    // must track the finger 1:1 — no transition, and a proportional value.
    const halfScale = 1 - (1 - nestedScale) / 2;
    content.style.transition = "none";
    content.style.transform = `scale(${halfScale}) translate3d(0, -8px, 0)`;
    await flushObserver();
    expect(Number(scrim.style.opacity)).toBeCloseTo(0.1, 2);
    expect(scrim.style.transition).toBe("none");

    // vaul, on close: scale back to rest. The scrim clears again.
    content.style.transition = "transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
    content.style.transform = "scale(1) translate3d(0, 0, 0)";
    await flushObserver();
    expect(scrim.style.opacity).toBe("");
  });
});
