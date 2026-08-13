/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PageLinkPreviewBodyRegion,
  PageLinkPreviewCardMissing,
} from "@/components/editor/page-link-preview.tsx";
import type { PageLinkPreviewBody } from "@/lib/pages/page-link-preview-model.ts";

afterEach(() => {
  cleanup();
});

function renderBody(body: PageLinkPreviewBody) {
  return render(<PageLinkPreviewBodyRegion body={body} />);
}

describe("PageLinkPreviewBodyRegion", () => {
  it("renders prose, list markers, and table headers", () => {
    renderBody({
      hiddenCount: 0,
      lines: [
        { id: "h", kind: "heading", level: 1, text: "Roadmap" },
        { id: "t", kind: "text", text: "Shipping in March" },
        {
          depth: 0,
          id: "b",
          index: 1,
          kind: "bullet",
          ordered: true,
          text: "Design",
        },
        { checked: true, depth: 0, id: "c", kind: "checklist", text: "Spec" },
        { columns: ["Name", "Owner"], id: "tbl", kind: "table" },
      ],
    });

    expect(screen.getByText("Roadmap")).toBeTruthy();
    expect(screen.getByText("Shipping in March")).toBeTruthy();
    expect(screen.getByText("1.")).toBeTruthy();
    expect(screen.getByText("☑")).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
  });

  it("counts withheld lines, singular and plural", () => {
    renderBody({
      hiddenCount: 1,
      lines: [{ id: "t", kind: "text", text: "One" }],
    });
    expect(screen.getByText("1 more block")).toBeTruthy();

    cleanup();

    renderBody({
      hiddenCount: 4,
      lines: [{ id: "t", kind: "text", text: "One" }],
    });
    expect(screen.getByText("4 more blocks")).toBeTruthy();
  });

  it("omits the footer when the whole page fits", () => {
    renderBody({
      hiddenCount: 0,
      lines: [{ id: "t", kind: "text", text: "One" }],
    });

    expect(
      document.querySelector('[data-slot="page-link-preview-more"]')
    ).toBeNull();
  });

  it("says so when the page has no content", () => {
    renderBody({ hiddenCount: 0, lines: [] });

    expect(screen.getByText("No content yet")).toBeTruthy();
  });
});

describe("PageLinkPreviewCardMissing", () => {
  it("keeps the stored label when the page cannot be resolved", () => {
    render(<PageLinkPreviewCardMissing label="Archived spec" />);

    expect(screen.getByText("Archived spec")).toBeTruthy();
    expect(screen.getByText("Page not found")).toBeTruthy();
  });
});
