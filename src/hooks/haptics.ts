/** Public hook entry point for haptic feedback (see haptics-provider). */
// biome-ignore lint/performance/noBarrelFile: intentional public entry point for the haptics module
export {
  type HapticMoment,
  HapticsProvider,
  useHaptics,
} from "@/components/layout/haptics-provider.tsx";
