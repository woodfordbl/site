import {
  MEDIA_COARSE_PRIMARY_POINTER,
  MEDIA_NARROW_VIEWPORT,
} from "@/lib/device/device-layout.constants.ts";
import type { DeviceLayoutHints } from "@/lib/device/device-layout.types.ts";

/** Live layout hints from `matchMedia` (browser only). */
export function readDeviceLayoutFromMatchMedia(): DeviceLayoutHints {
  if (typeof window === "undefined") {
    return {
      isCoarsePrimaryPointer: false,
      isNarrowViewport: false,
    };
  }

  return {
    isCoarsePrimaryPointer: window.matchMedia(MEDIA_COARSE_PRIMARY_POINTER)
      .matches,
    isNarrowViewport: window.matchMedia(MEDIA_NARROW_VIEWPORT).matches,
  };
}

export function subscribeDeviceLayoutMatchMedia(
  onChange: () => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const narrow = window.matchMedia(MEDIA_NARROW_VIEWPORT);
  const coarse = window.matchMedia(MEDIA_COARSE_PRIMARY_POINTER);

  const listener = () => {
    onChange();
  };

  narrow.addEventListener("change", listener);
  coarse.addEventListener("change", listener);

  return () => {
    narrow.removeEventListener("change", listener);
    coarse.removeEventListener("change", listener);
  };
}
