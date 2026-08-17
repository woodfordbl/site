import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadMotionFeatures = () =>
  import("@/components/ui/morph-motion-features.ts").then((mod) => mod.default);

/**
 * The open/close spring every morph shares, so a map expanding and an image
 * opening in the lightbox travel at the same rate.
 */
export const MORPH_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 34,
} as const;

/**
 * Motion context for the surfaces that morph — media blocks and maps.
 *
 * Defers the animation engine to an async chunk (`m.*` components render
 * immediately and animate once it arrives), enforces `m.*`-only usage via
 * strict, and honors OS reduced-motion. Each morphing surface wraps itself;
 * children that portal (a lightbox, an expanded map) stay inside the provider
 * that rendered them, so one wrapper covers both halves of a morph.
 */
export function MorphMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
