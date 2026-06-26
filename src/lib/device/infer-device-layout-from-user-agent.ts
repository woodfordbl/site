import Bowser from "bowser";

import type { DeviceLayoutHints } from "@/lib/device/device-layout.types.ts";

export interface UserAgentInferenceInput {
  clientHints?: Bowser.ClientHints;
  userAgent: string;
}

const DESKTOP_HINTS: DeviceLayoutHints = {
  isCoarsePrimaryPointer: false,
  isNarrowViewport: false,
};

/** SSR fallback when no client-measured cookie exists yet. */
export function inferDeviceLayoutFromUserAgent({
  userAgent,
  clientHints,
}: UserAgentInferenceInput): DeviceLayoutHints {
  if (!userAgent.trim()) {
    return DESKTOP_HINTS;
  }

  const parser = Bowser.getParser(userAgent, clientHints);
  const platformType = parser.getPlatformType(true);

  if (platformType === "mobile") {
    return {
      isNarrowViewport: true,
      isCoarsePrimaryPointer: true,
    };
  }

  if (platformType === "tablet") {
    return {
      isNarrowViewport: false,
      isCoarsePrimaryPointer: true,
    };
  }

  if (clientHints?.mobile === true) {
    return {
      isNarrowViewport: true,
      isCoarsePrimaryPointer: true,
    };
  }

  return DESKTOP_HINTS;
}
