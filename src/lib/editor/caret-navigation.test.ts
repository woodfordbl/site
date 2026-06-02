// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  findCanvasTextField,
  shouldNavigateDownFromField,
  shouldNavigateUpFromField,
} from "@/lib/editor/caret-navigation.ts";

function textarea(value: string, start: number, end = start) {
  const field = document.createElement("textarea");
  field.value = value;
  field.setSelectionRange(start, end);
  return field;
}

describe("shouldNavigateUpFromField", () => {
  it("navigates from the end of a single-line textarea", () => {
    const field = textarea("Hello", 5);
    expect(shouldNavigateUpFromField(field)).toBe(true);
  });

  it("navigates from the start of a single-line textarea", () => {
    const field = textarea("Hello", 0);
    expect(shouldNavigateUpFromField(field)).toBe(true);
  });

  it("does not navigate from later lines in a multiline textarea", () => {
    const field = textarea("Line one\nLine two", "Line one\nLine two".length);
    expect(shouldNavigateUpFromField(field)).toBe(false);
  });

  it("does not navigate with a text selection", () => {
    const field = textarea("Hello", 0, 5);
    expect(shouldNavigateUpFromField(field)).toBe(false);
  });
});

describe("shouldNavigateDownFromField", () => {
  it("navigates from the end of a single-line textarea", () => {
    const field = textarea("Hello", 5);
    expect(shouldNavigateDownFromField(field)).toBe(true);
  });

  it("does not navigate from earlier lines in a multiline textarea", () => {
    const field = textarea("Line one\nLine two", 0);
    expect(shouldNavigateDownFromField(field)).toBe(false);
  });
});

describe("findCanvasTextField", () => {
  it("skips checkbox inputs and returns the canvas text field", () => {
    const container = document.createElement("div");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const field = document.createElement("textarea");
    field.dataset.canvasField = "true";
    container.append(checkbox, field);

    expect(findCanvasTextField(container)).toBe(field);
  });
});
