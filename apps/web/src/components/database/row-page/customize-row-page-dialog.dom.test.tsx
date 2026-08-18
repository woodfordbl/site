/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CustomizeRowPageDialog } from "@/components/database/row-page/customize-row-page-dialog.tsx";

/**
 * @fileoverview The fork a reader hits the first time they try to edit a row
 * page that is still rendering the shared template. Both ways out have to be
 * on offer — customizing this one row, or editing the template every row
 * follows — because taking the first when you meant the second is how someone
 * ends up editing fourteen pages to make one change. Exactly two buttons: with
 * no template to send them to, the alternative is backing out.
 */

beforeAll(() => {
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

/** Top level so the rule about regex literals in scopes stays satisfied. */
const TEMPLATE_SENTENCE = /follows the Launch Sites template/;
const NO_TEMPLATE_SENTENCE = /Every row in Launch Sites shares one body/;

afterEach(() => {
  cleanup();
});

function renderDialog(overrides?: {
  hasTemplate?: boolean;
  onEditTemplate?: () => void;
}) {
  const onCustomize = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CustomizeRowPageDialog
      databaseName="Launch Sites"
      hasTemplate={overrides?.hasTemplate ?? true}
      onCustomize={onCustomize}
      onEditTemplate={overrides?.onEditTemplate}
      onOpenChange={onOpenChange}
      open
    />
  );
  return { onCustomize, onOpenChange };
}

describe("CustomizeRowPageDialog", () => {
  it("names the template and states the one thing customizing changes", () => {
    renderDialog();

    const description = screen.getByText(TEMPLATE_SENTENCE);
    expect(description.textContent).toContain("stops updating");
  });

  it("materializes the page on demand", () => {
    const { onCustomize } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Edit this page" }));

    expect(onCustomize).toHaveBeenCalled();
  });

  it("offers the template as the other way to make the change", () => {
    const onEditTemplate = vi.fn();
    renderDialog({ onEditTemplate });

    fireEvent.click(screen.getByRole("button", { name: "Edit template" }));

    expect(onEditTemplate).toHaveBeenCalled();
  });

  it("offers backing out instead when there is nowhere to send them", () => {
    renderDialog();

    expect(screen.queryByRole("button", { name: "Edit template" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("never shows a third way out", () => {
    renderDialog({ onEditTemplate: vi.fn() });

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("does not claim a template is being left behind when there is none", () => {
    renderDialog({ hasTemplate: false, onEditTemplate: vi.fn() });

    expect(screen.queryByText(TEMPLATE_SENTENCE)).toBeNull();
    expect(screen.getByText(NO_TEMPLATE_SENTENCE)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create a template" })
    ).toBeTruthy();
  });
});
