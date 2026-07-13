import type { KeyboardEventHandler } from "react";

interface PreviewResolutionKeyDownOptions {
  disabled?: boolean;
  onKeep: () => void;
  onUseSiteVersion: () => void;
}

/**
 * Capture-phase key handler for the site-version preview toolbar: K keeps local
 * edits, U opens the destructive confirm. Attach to the preview root container.
 */
export function createPreviewResolutionKeyDownHandler({
  disabled = false,
  onKeep,
  onUseSiteVersion,
}: PreviewResolutionKeyDownOptions): KeyboardEventHandler<HTMLDivElement> {
  return (event) => {
    if (disabled) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "k" || event.key === "K") {
      event.preventDefault();
      event.stopPropagation();
      onKeep();
      return;
    }

    if (event.key === "u" || event.key === "U") {
      event.preventDefault();
      event.stopPropagation();
      onUseSiteVersion();
    }
  };
}
