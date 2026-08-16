/**
 * Snapshots the bounding rects of every element carrying `attribute`, keyed by
 * the attribute's value. Used to cache row geometry at drag start so pointer
 * resolution does not thrash layout on every `dragover`.
 */
export function collectRects(attribute: string): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (typeof document === "undefined") {
    return map;
  }

  for (const element of document.querySelectorAll(`[${attribute}]`)) {
    const id = element.getAttribute(attribute);
    if (id) {
      map.set(id, element.getBoundingClientRect());
    }
  }

  return map;
}
