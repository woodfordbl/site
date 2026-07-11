/**
 * Shared guard for the dev author write-back server fns (`savePage`,
 * `saveMediaAssets`). `import.meta.env.DEV` is a compile-time constant, so in
 * production builds every call site compiles to an unconditional throw — the
 * write path is dead code, not a runtime check that could be bypassed.
 */
export function assertAuthorSaveAllowed(
  isDev: boolean = import.meta.env.DEV
): void {
  if (!isDev) {
    throw new Error("Author save is only available in development");
  }
}
