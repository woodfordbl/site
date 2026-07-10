/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { MediaLightbox } from "@/components/blocks/types/media/media-lightbox.tsx";

afterEach(cleanup);

const TINY_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        view
      </button>
      <MediaLightbox
        alt="test image"
        displayUrl={TINY_GIF}
        kind="image"
        layoutId="test-morph"
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

function queryPopup(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[role='dialog']");
}

// The lightbox defers Base UI's unmount until the motion exit finishes
// (preventUnmountOnClose + actionsRef.unmount in onExitComplete). These tests
// lock in that handshake: the popup must fully mount on open and fully leave
// the DOM after close — a regression here means a lightbox that never closes.
describe("MediaLightbox open/close lifecycle", () => {
  it("mounts the dialog with the image when opened", async () => {
    const { getByText } = render(<Harness />);
    expect(queryPopup()).toBeNull();

    fireEvent.click(getByText("view"));

    await waitFor(() => {
      const popup = queryPopup();
      expect(popup).not.toBeNull();
      expect(popup?.hidden).toBe(false);
      expect(popup?.querySelector("img")?.getAttribute("alt")).toBe(
        "test image"
      );
    });
  });

  it("unmounts the dialog after the close button is pressed", async () => {
    const { getByText } = render(<Harness initialOpen />);
    await waitFor(() => {
      expect(queryPopup()).not.toBeNull();
    });

    const close = document.querySelector<HTMLElement>(
      "[data-slot='dialog-close']"
    );
    expect(close).not.toBeNull();
    if (close) {
      fireEvent.click(close);
    }

    await waitFor(() => {
      expect(queryPopup()).toBeNull();
    });
  });

  it("survives a reopen during the exit animation", async () => {
    const { getByText } = render(<Harness initialOpen />);
    await waitFor(() => {
      expect(queryPopup()).not.toBeNull();
    });

    const close = document.querySelector<HTMLElement>(
      "[data-slot='dialog-close']"
    );
    if (close) {
      fireEvent.click(close);
    }
    // Reopen immediately, before the exit can finish.
    fireEvent.click(getByText("view"));

    await waitFor(() => {
      const popup = queryPopup();
      expect(popup).not.toBeNull();
      expect(popup?.hidden).toBe(false);
    });
  });
});
