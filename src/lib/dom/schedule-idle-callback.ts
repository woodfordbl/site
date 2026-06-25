interface ScheduleIdleCallbackOptions {
  timeout?: number;
}

/** Defer work until idle; falls back to `setTimeout` when `requestIdleCallback` is missing (e.g. iOS Safari). */
export function scheduleIdleCallback(
  callback: () => void,
  options?: ScheduleIdleCallbackOptions
): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, options);
    return () => {
      window.cancelIdleCallback(idleId);
    };
  }

  const delay = options?.timeout ?? 0;
  const timeoutId = window.setTimeout(callback, delay);
  return () => {
    window.clearTimeout(timeoutId);
  };
}
