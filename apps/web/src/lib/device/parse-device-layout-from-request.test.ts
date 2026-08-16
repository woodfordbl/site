import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(),
  getRequestHeader: vi.fn(),
}));

import { getCookie, getRequestHeader } from "@tanstack/react-start/server";

import { readDeviceLayoutHintsFromRequest } from "@/lib/device/parse-device-layout-from-request.server.ts";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

beforeEach(() => {
  vi.mocked(getCookie).mockReturnValue(undefined);
  vi.mocked(getRequestHeader).mockImplementation((name: string) => {
    if (name === "user-agent") {
      return DESKTOP_UA;
    }
    return;
  });
});

describe("readDeviceLayoutHintsFromRequest", () => {
  it("prefers the client-measured cookie over UA inference", () => {
    vi.mocked(getCookie).mockReturnValue('{"nv":0,"cp":1}');
    vi.mocked(getRequestHeader).mockImplementation((name: string) => {
      if (name === "user-agent") {
        return IPHONE_UA;
      }
      return;
    });

    expect(readDeviceLayoutHintsFromRequest()).toEqual({
      isNarrowViewport: false,
      isCoarsePrimaryPointer: true,
    });
  });

  it("seeds mobile phones with narrow viewport and coarse pointer", () => {
    vi.mocked(getRequestHeader).mockImplementation((name: string) => {
      if (name === "user-agent") {
        return IPHONE_UA;
      }
      return;
    });

    expect(readDeviceLayoutHintsFromRequest()).toEqual({
      isNarrowViewport: true,
      isCoarsePrimaryPointer: true,
    });
  });

  it("seeds tablets with coarse pointer only", () => {
    vi.mocked(getRequestHeader).mockImplementation((name: string) => {
      if (name === "user-agent") {
        return IPAD_UA;
      }
      return;
    });

    expect(readDeviceLayoutHintsFromRequest()).toEqual({
      isNarrowViewport: false,
      isCoarsePrimaryPointer: true,
    });
  });

  it("seeds desktop when no cookie or mobile hints exist", () => {
    expect(readDeviceLayoutHintsFromRequest()).toEqual({
      isNarrowViewport: false,
      isCoarsePrimaryPointer: false,
    });
  });

  it("uses Sec-CH-UA-Mobile when UA alone is ambiguous", () => {
    vi.mocked(getRequestHeader).mockImplementation((name: string) => {
      if (name === "user-agent") {
        return DESKTOP_UA;
      }
      if (name === "sec-ch-ua-mobile") {
        return "?1";
      }
      return;
    });

    expect(readDeviceLayoutHintsFromRequest()).toEqual({
      isNarrowViewport: true,
      isCoarsePrimaryPointer: true,
    });
  });
});
