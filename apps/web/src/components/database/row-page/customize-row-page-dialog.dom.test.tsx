/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CustomizeRowPageDialog } from "@/components/database/row-page/customize-row-page-dialog.tsx";

/**
 * @fileoverview The fork a reader hits the first time they try to edit a row
 * page that is still rendering the shared template. Both ways out have to be
 * on offer — customizing this one row, or editing the template every row
 * follows — because taking the first when you meant the second is how someone
 * ends up editing fourteen pages to make one change.
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
const TEMPLATE_SENTENCE = /renders the Launch Sites template/;
const NO_TEMPLATE_SENTENCE = /Rows in Launch Sites share one body/;

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
  it("names the template and states what customizing costs", () => {
    renderDialog();

    const description = screen.getByText(TEMPLATE_SENTENCE);
    expect(description.textContent).toContain("stops following it");
    expect(description.textContent).toContain("heavier to load");
  });

  it("materializes the page on demand", () => {
    const { onCustomize } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Edit this page" }));

    expect(onCustomize).toHaveBeenCalled();
  });

  it("offers the template as the other way to make the change", () => {
    const onEditTemplate = vi.fn();
    renderDialog({ onEditTemplate });

    fireEvent.click(
      screen.getByRole("button", { name: "Edit template instead" })
    );

    expect(onEditTemplate).toHaveBeenCalled();
  });

  it("hides the template route when there is nowhere to send them", () => {
    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Edit template instead" })
    ).toBeNull();
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
