import { useCallback, useEffect, useState } from "react";

import {
  measureObjectContainContentBounds,
  type NaturalMediaSize,
  type ObjectContainContentBounds,
} from "@/lib/dom/object-contain-bounds.ts";

export function useObjectContainBounds(
  element: HTMLElement | null,
  naturalSize: NaturalMediaSize | null
): ObjectContainContentBounds | null {
  const [bounds, setBounds] = useState<ObjectContainContentBounds | null>(null);

  const measure = useCallback(() => {
    if (!(element && naturalSize)) {
      setBounds(null);
      return;
    }

    setBounds(measureObjectContainContentBounds(element, naturalSize));
  }, [element, naturalSize]);

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
