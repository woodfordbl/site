import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import type Bowser from "bowser";
import { DEVICE_LAYOUT_COOKIE_NAME } from "@/lib/device/device-layout.constants.ts";
import type { DeviceLayoutHints } from "@/lib/device/device-layout.types.ts";
import {
  deviceLayoutCookieToHints,
  parseDeviceLayoutCookie,
} from "@/lib/device/device-layout-cookie.ts";
import { inferDeviceLayoutFromUserAgent } from "@/lib/device/infer-device-layout-from-user-agent.ts";

function readClientHintsFromRequest(): Bowser.ClientHints | undefined {
  const mobileHint = getRequestHeader("sec-ch-ua-mobile");
  const platformHint = getRequestHeader("sec-ch-ua-platform");
  const brandsHint = getRequestHeader("sec-ch-ua");

  if (!(mobileHint || platformHint || brandsHint)) {
    return;
  }

  const hints: Bowser.ClientHints = {};

  if (mobileHint === "?1") {
    hints.mobile = true;
  } else if (mobileHint === "?0") {
    hints.mobile = false;
  }

  if (platformHint) {
    hints.platform = platformHint.replace(/^"|"$/g, "");
  }

  if (brandsHint) {
    try {
      const brands = JSON.parse(brandsHint) as Array<{
        brand: string;
        version: string;
      }>;
      if (Array.isArray(brands)) {
        hints.brands = brands;
      }
    } catch {
      // Ignore malformed Client Hints brand lists.
    }
  }

  return hints;
}

/** Reads cookie-first device layout hints for SSR shell + canvas seeding. */
export function readDeviceLayoutHintsFromRequest(): DeviceLayoutHints {
  const cookie = parseDeviceLayoutCookie(getCookie(DEVICE_LAYOUT_COOKIE_NAME));
  if (cookie) {
    return deviceLayoutCookieToHints(cookie);
  }

  return inferDeviceLayoutFromUserAgent({
    userAgent: getRequestHeader("user-agent") ?? "",
    clientHints: readClientHintsFromRequest(),
  });
}
