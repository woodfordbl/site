import type { DeviceLayoutHints } from "@/lib/device/device-layout.types.ts";
import {
  deviceLayoutCookieToHints,
  readDeviceLayoutCookieFromDocument,
} from "@/lib/device/device-layout-cookie.ts";
import { getDeviceLayoutHints } from "@/lib/device/get-device-layout-hints.ts";

const DESKTOP_HINTS: DeviceLayoutHints = {
  isCoarsePrimaryPointer: false,
  isNarrowViewport: false,
};

export function loadDeviceLayoutHints(): Promise<DeviceLayoutHints> {
  if (typeof window === "undefined") {
    return getDeviceLayoutHints();
  }

  const cookie = readDeviceLayoutCookieFromDocument();
  if (cookie) {
    return Promise.resolve(deviceLayoutCookieToHints(cookie));
  }

  return Promise.resolve(DESKTOP_HINTS);
}
