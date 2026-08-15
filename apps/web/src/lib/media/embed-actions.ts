/** Copy the embed source URL to the system clipboard. */
export async function copyEmbedLink(url: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Silent fail — no toast system.
  }
}

/** Open the embed source URL in a new browser tab. */
export function openEmbedInBrowser(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
