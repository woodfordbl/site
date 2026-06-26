import { describe, expect, it } from "vitest";

import {
  deviceLayoutCookieToHints,
  deviceLayoutHintsToCookie,
  parseDeviceLayoutCookie,
  serializeDeviceLayoutCookie,
} from "@/lib/device/device-layout-cookie.ts";

describe("parseDeviceLayoutCookie", () => {
  it("returns null for missing or invalid payloads", () => {
    expect(parseDeviceLayoutCookie(undefined)).toBeNull();
    expect(parseDeviceLayoutCookie("")).toBeNull();
    expect(parseDeviceLayoutCookie("not-json")).toBeNull();
    expect(parseDeviceLayoutCookie(JSON.stringify({ nv: 1 }))).toBeNull();
  });

  it("parses compact nv/cp flags", () => {
    expect(parseDeviceLayoutCookie('{"nv":1,"cp":0}')).toEqual({
      nv: 1,
      cp: 0,
    });
    expect(parseDeviceLayoutCookie('{"nv":0,"cp":1}')).toEqual({
      nv: 0,
      cp: 1,
    });
  });
});

describe("device layout cookie round-trip", () => {
  it("serializes and maps hints both ways", () => {
    const hints = {
      isNarrowViewport: true,
      isCoarsePrimaryPointer: false,
    };

    const cookie = deviceLayoutHintsToCookie(hints);
    expect(serializeDeviceLayoutCookie(cookie)).toBe('{"nv":1,"cp":0}');
    expect(deviceLayoutCookieToHints(cookie)).toEqual(hints);
  });
});
