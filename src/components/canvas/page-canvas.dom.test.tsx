/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PageCanvas } from "@/components/canvas/page-canvas.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import type { Block } from "@/lib/schemas/block.ts";

// The lazy editor chunk is irrelevant to the flash guarantee (it swaps in with
// identical markup after paint) and needs the full app provider tree — stub it.
vi.mock("@/components/canvas/page-canvas-editor.tsx", () => ({
  PageCanvasEditor: () => <div data-testid="page-canvas-editor" />,
}));

const PAGE_ID = "home";
const SERVER_TEXT = "Shipped server copy";
const LOCAL_TEXT = "Locally edited copy";

function textBlock(id: string, text: string): Block {
  return { id, type: "text", props: { text } } as Block;
}

const serverPage: ServerPageSource = {
  id: PAGE_ID,
  slug: "/",
  title: "Home",
  parentId: null,
  blocks: [textBlock("b-server", SERVER_TEXT)],
};

function seedLocalDraft() {
  localStorage.setItem(
    `site-local-blocks:${PAGE_ID}`,
    JSON.stringify({
      "b-local": {
        versionKey: "v1",
        data: {
          id: "b-local",
          pageId: PAGE_ID,
          type: "text",
          props: { text: LOCAL_TEXT },
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      },
    })
  );
  localStorage.setItem(
    "site-local-pages",
    JSON.stringify({
      [PAGE_ID]: {
        versionKey: "v1",
        data: {
          id: PAGE_ID,
          slug: "/",
          title: "Home",
          parentId: null,
          blockOrder: ["b-local"],
          serverBaselineHash: "aaaaaaaa",
          serverMetadataBaseline: "bbbbbbbb",
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      },
    })
  );
}

function canvas(pageHasLocalDraft: boolean) {
  return (
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <PageCanvas
        fullWidth={false}
        isNarrowViewport={false}
        pageHasLocalDraft={pageHasLocalDraft}
        serverPage={serverPage}
      />
    </DeviceLayoutProvider>
  );
}

beforeAll(() => {
  // jsdom has no matchMedia; DeviceLayoutProvider re-measures with it on mount.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * The no-flash invariant for local-first pages: once a page has a local draft
 * (dirty cookie set), the server baseline must never be painted for it — not
 * during SSR, not on the first client frame, not when navigating back to it
 * from a clean server page.
 * @see docs/architecture/local-first-persistence.md ("Flash-free render swap")
 */
describe("PageCanvas no-SSR-flash guarantee", () => {
  it("SSR emits full server content for a clean page", () => {
    const html = renderToString(canvas(false));
    expect(html).toContain(SERVER_TEXT);
  });

  it("SSR emits no server content for a dirty page", () => {
    const html = renderToString(canvas(true));
    expect(html).not.toContain(SERVER_TEXT);
    expect(html).toBe("");
  });

  it("paints local content on the first client frame of a dirty page", async () => {
    seedLocalDraft();

    const { container } = render(canvas(true));

    // Synchronous first commit, before the (mocked) editor chunk resolves:
    // local blocks are visible, the server baseline never rendered.
    expect(container.textContent).toContain(LOCAL_TEXT);
    expect(container.textContent).not.toContain(SERVER_TEXT);
    expect(screen.queryByTestId("page-canvas-editor")).toBeNull();

    // The editor chunk then takes over without a server frame in between.
    await screen.findByTestId("page-canvas-editor");
    expect(container.textContent).not.toContain(SERVER_TEXT);
  });

  it("renders the server baseline for a clean page on the client", async () => {
    const { container } = render(canvas(false));

    expect(container.textContent).toContain(SERVER_TEXT);
    expect(container.textContent).not.toContain(LOCAL_TEXT);

    await screen.findByTestId("page-canvas-editor");
  });

  it("navigating from a clean server page back to a dirty page paints local content immediately", async () => {
    seedLocalDraft();

    // Visit a clean server page first (server content is expected there).
    const clean = render(canvas(false));
    expect(clean.container.textContent).toContain(SERVER_TEXT);
    await screen.findByTestId("page-canvas-editor");
    clean.unmount();

    // Back to the dirty page: the first commit must already be local content.
    const dirty = render(canvas(true));
    expect(dirty.container.textContent).toContain(LOCAL_TEXT);
    expect(dirty.container.textContent).not.toContain(SERVER_TEXT);

    await screen.findByTestId("page-canvas-editor");
    expect(dirty.container.textContent).not.toContain(SERVER_TEXT);
  });
});
