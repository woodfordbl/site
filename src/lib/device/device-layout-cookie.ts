import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";
import { DEVICE_LAYOUT_COOKIE_NAME } from "@/lib/device/device-layout.constants.ts";
import type {
  DeviceLayoutCookie,
  DeviceLayoutHints,
} from "@/lib/device/device-layout.types.ts";

function toFlag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function fromFlag(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}

/** Parses the raw cookie string; returns null when missing or invalid. */
export function parseDeviceLayoutCookie(
  value: string | undefined
): DeviceLayoutCookie | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("nv" in parsed) ||
      !("cp" in parsed)
    ) {
      return null;
    }

    const record = parsed as { cp: unknown; nv: unknown };
    return {
      nv: fromFlag(record.nv) ? 1 : 0,
      cp: fromFlag(record.cp) ? 1 : 0,
    };
  } catch {
    return null;
  }
}

export function deviceLayoutCookieToHints(
  cookie: DeviceLayoutCookie
): DeviceLayoutHints {
  return {
    isNarrowViewport: cookie.nv === 1,
    isCoarsePrimaryPointer: cookie.cp === 1,
  };
}

export function deviceLayoutHintsToCookie(
  hints: DeviceLayoutHints
): DeviceLayoutCookie {
  return {
    nv: toFlag(hints.isNarrowViewport),
    cp: toFlag(hints.isCoarsePrimaryPointer),
  };
}

export function serializeDeviceLayoutCookie(
  cookie: DeviceLayoutCookie
): string {
  return JSON.stringify(cookie);
}

export function readDeviceLayoutCookieFromDocument(): DeviceLayoutCookie | null {
  return parseDeviceLayoutCookie(readDocumentCookie(DEVICE_LAYOUT_COOKIE_NAME));
}

/** Persists client-measured layout hints for SSR on the next request. */
export function writeDeviceLayoutCookieToDocument(
  hints: DeviceLayoutHints
): boolean {
  return writeDocumentCookie(
    DEVICE_LAYOUT_COOKIE_NAME,
    serializeDeviceLayoutCookie(deviceLayoutHintsToCookie(hints))
  );
}
