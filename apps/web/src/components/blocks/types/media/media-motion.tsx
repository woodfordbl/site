import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadMotionFeatures = () =>
  import("@/components/blocks/types/media/media-motion-features.ts").then(
    (mod) => mod.default
  );

/**
 * Motion context for media blocks: defers the animation engine to an async
 * chunk (`m.*` components render immediately and animate once it arrives),
 * enforces `m.*`-only usage via strict, and honors OS reduced-motion.
 * MediaLightbox portals under MediaFrame, so one provider covers both;
 * standalone renders (tests) must wrap themselves.
 */
export function MediaMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
