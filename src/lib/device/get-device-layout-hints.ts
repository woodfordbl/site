import { createServerFn } from "@tanstack/react-start";
import type { DeviceLayoutHints } from "@/lib/device/device-layout.types.ts";
import { readDeviceLayoutHintsFromRequest } from "@/lib/device/parse-device-layout-from-request.server.ts";

export const getDeviceLayoutHints = createServerFn({
  method: "GET",
}).handler(
  async (): Promise<DeviceLayoutHints> => readDeviceLayoutHintsFromRequest()
);
