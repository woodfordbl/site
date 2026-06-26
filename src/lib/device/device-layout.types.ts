/** Resolved device layout signals used by shell + canvas. */
export interface DeviceLayoutHints {
  isCoarsePrimaryPointer: boolean;
  isNarrowViewport: boolean;
}

/** Compact cookie payload written from client `matchMedia` measurements. */
export interface DeviceLayoutCookie {
  cp: 0 | 1;
  nv: 0 | 1;
}
