/** Public hook entry points for device layout signals (see device-layout-provider). */
// biome-ignore lint/performance/noBarrelFile: intentional hook module boundary per docs
export {
  SyncDeviceLayoutCookieEffect,
  useDeviceLayout,
  useIsCoarsePrimaryPointer,
  useIsNarrowViewport,
} from "@/components/layout/device-layout-provider.tsx";
