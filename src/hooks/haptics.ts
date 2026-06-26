/** Public hook entry point for haptic feedback (see haptics-provider). */
// biome-ignore lint/performance/noBarrelFile: intentional hook module boundary per docs
export {
  type HapticMoment,
  HapticsProvider,
  useHaptics,
} from "@/components/layout/haptics-provider.tsx";
