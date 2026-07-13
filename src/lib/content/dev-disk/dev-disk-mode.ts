/**
 * Dev disk mode: in local dev the repo's `content/` tree is the source of
 * truth — the editor reads fresh from disk and continuously flushes edits
 * back (no Save-all, no stale banner, no localStorage persistence for
 * content). `VITE_DEV_DISK=0` restores the legacy local-first flow, which is
 * also how the production visitor experience is tested locally.
 *
 * The check compiles to a constant `false` in production builds, so every
 * dev-disk branch is dead-code-eliminated.
 */
export function isDevDiskMode(): boolean {
  return (
    import.meta.env.DEV &&
    import.meta.env.MODE !== "test" &&
    import.meta.env.VITE_DEV_DISK !== "0"
  );
}
