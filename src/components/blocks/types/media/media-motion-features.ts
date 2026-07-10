/**
 * Only dynamically imported (see media-motion.tsx) so motion's animation
 * engine code-splits into an async chunk instead of the main bundle.
 * domMax (not domAnimation) because the lightbox morph needs layout
 * projection.
 */
// biome-ignore lint/performance/noBarrelFile: not a barrel — this re-export is the LazyMotion async-chunk split point
export { domMax as default } from "motion/react";
