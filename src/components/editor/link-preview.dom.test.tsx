/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  LINK_PREVIEW_MEDIA_FRAME_CLASSNAME,
  LINK_PREVIEW_MEDIA_HEIGHT_PX,
  LINK_PREVIEW_MEDIA_WIDTH_PX,
  LinkPreviewCard,
} from "@/components/editor/link-preview.tsx";

const SAMPLE_URL = "https://altitude.dev/docs/getting-started";
const LONG_TITLE =
  "Altitude — ship faster with a very long page title that must clamp to two lines inside the compact horizontal OG card";

afterEach(() => {
  cleanup();
});

describe("LinkPreviewCard", () => {
  it("reserves a compact 16:9 media frame and clamps the title", () => {
    render(
      <LinkPreviewCard
        hostname="altitude.dev"
        preview={{
          faviconUrl: "https://altitude.dev/favicon.ico",
          imageUrl: "https://altitude.dev/og.png",
          title: LONG_TITLE,
        }}
        status="success"
        url={SAMPLE_URL}
      />
    );

    const media = document.querySelector('[data-slot="link-preview-media"]');
    expect(media).toBeTruthy();
    for (const token of LINK_PREVIEW_MEDIA_FRAME_CLASSNAME.split(" ")) {
      expect(media?.classList.contains(token)).toBe(true);
    }

    const ogImage = media?.querySelector("img");
    expect(ogImage?.getAttribute("width")).toBe(
      String(LINK_PREVIEW_MEDIA_WIDTH_PX)
    );
    expect(ogImage?.getAttribute("height")).toBe(
      String(LINK_PREVIEW_MEDIA_HEIGHT_PX)
    );
    expect(ogImage?.classList.contains("object-cover")).toBe(true);

    const title = screen.getByText(LONG_TITLE);
    expect(title.classList.contains("line-clamp-2")).toBe(true);
    expect(title.classList.contains("min-w-0")).toBe(true);
    expect(title.getAttribute("title")).toBe(LONG_TITLE);
  });

  it("hyperlinks the domain without stealing focus on mousedown", () => {
    render(
      <LinkPreviewCard
        hostname="altitude.dev"
        preview={{ title: "Altitude" }}
        status="success"
        url={SAMPLE_URL}
      />
    );

    const link = screen.getByRole("link", { name: "altitude.dev" });
    expect(link.getAttribute("href")).toBe(SAMPLE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.classList.contains("text-primary")).toBe(true);

    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("centers favicon fallback in the same reserved media frame", () => {
    render(
      <LinkPreviewCard
        hostname="altitude.dev"
        preview={{
          faviconUrl: "https://altitude.dev/favicon.ico",
          title: "Altitude",
        }}
        status="success"
        url={SAMPLE_URL}
      />
    );

    const media = document.querySelector('[data-slot="link-preview-media"]');
    expect(media?.classList.contains("flex")).toBe(true);
    expect(media?.classList.contains("items-center")).toBe(true);
    expect(media?.classList.contains("justify-center")).toBe(true);
    expect(media?.classList.contains("w-[85px]")).toBe(true);
    expect(media?.classList.contains("h-12")).toBe(true);

    const favicon = media?.querySelector("img");
    expect(favicon?.classList.contains("object-contain")).toBe(true);
  });

  it("matches loading skeleton to the media frame geometry", () => {
    render(
      <LinkPreviewCard
        hostname="altitude.dev"
        status="pending"
        url={SAMPLE_URL}
      />
    );

    const skeleton = document.querySelector(
      '[data-slot="link-preview-media-skeleton"]'
    );
    expect(skeleton).toBeTruthy();
    for (const token of LINK_PREVIEW_MEDIA_FRAME_CLASSNAME.split(" ")) {
      expect(skeleton?.classList.contains(token)).toBe(true);
    }
  });

  it("hyperlinks the domain in the error state", () => {
    render(
      <LinkPreviewCard
        hostname="altitude.dev"
        status="error"
        url={SAMPLE_URL}
      />
    );

    const link = screen.getByRole("link", { name: "altitude.dev" });
    expect(link.getAttribute("href")).toBe(SAMPLE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
