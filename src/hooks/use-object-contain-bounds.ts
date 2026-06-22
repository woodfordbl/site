import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import {
  measureObjectContainContentBounds,
  type NaturalMediaSize,
  type ObjectContainContentBounds,
} from "@/lib/dom/object-contain-bounds.ts";

function boundsAreEqual(
  current: ObjectContainContentBounds | null,
  next: ObjectContainContentBounds
): boolean {
  if (!current) {
    return false;
  }

  return (
    current.left === next.left &&
    current.top === next.top &&
    current.width === next.width &&
    current.height === next.height
  );
}

export function useObjectContainBounds(
  element: HTMLElement | null,
  naturalSize: NaturalMediaSize | null,
  /** Re-measure synchronously after layout when this value changes (e.g. live resize width). */
  layoutDependency?: number
): ObjectContainContentBounds | null {
  const [bounds, setBounds] = useState<ObjectContainContentBounds | null>(null);

  const measure = useCallback(() => {
    if (!(element && naturalSize)) {
      setBounds((current) => (current === null ? current : null));
      return;
    }

    const next = measureObjectContainContentBounds(element, naturalSize);
    setBounds((current) => (boundsAreEqual(current, next) ? current : next));
  }, [element, naturalSize]);

  // layoutDependency is an intentional sync remeasure trigger from resize width.
  // biome-ignore lint/correctness/useExhaustiveDependencies: external layout signal
  useLayoutEffect(() => {
    measure();
  }, [layoutDependency, measure]);

  useEffect(() => {
    measure();
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, measure]);

  return bounds;
}
