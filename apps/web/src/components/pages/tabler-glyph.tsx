import { createElement, type SVGProps } from "react";

import type { TablerIconNode } from "@/lib/pages/page-icon.ts";

const OUTLINE_ATTRS: SVGProps<SVGSVGElement> = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const FILLED_ATTRS: SVGProps<SVGSVGElement> = {
  fill: "currentColor",
  stroke: "none",
};

interface TablerGlyphProps {
  className?: string;
  filled?: boolean;
  node: TablerIconNode;
}

/**
 * Renders a Tabler icon from its raw `node` data (shared catalog asset) instead of a bundled
 * component, so the full icon set can be loaded lazily without inflating the main bundle.
 */
export function TablerGlyph({
  node,
  filled = false,
  className,
}: TablerGlyphProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...(filled ? FILLED_ATTRS : OUTLINE_ATTRS)}
    >
      {node.map(([tag, attrs], index) =>
        createElement(tag, { ...attrs, key: `${tag}-${index}` })
      )}
    </svg>
  );
}
