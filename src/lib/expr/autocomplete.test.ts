import { describe, expect, it } from "vitest";

import {
  type CaretContext,
  formulaCaretContext,
  isMethodOf,
} from "@/lib/expr/autocomplete.ts";

/** Context at the END of `source` (caret at the end). */
function contextAtEnd(source: string): CaretContext {
  return formulaCaretContext(source, source.length);
}

describe("formulaCaretContext", () => {
  it("detects property context after a scope-root dot", () => {
    expect(contextAtEnd("Page.")).toEqual({
      kind: "property",
      partial: "",
      replaceFrom: 0,
    });
    expect(contextAtEnd("round(Page.Wei")).toEqual({
      kind: "property",
      partial: "Wei",
      replaceFrom: 6,
    });
    expect(contextAtEnd("thisRow.")).toMatchObject({ kind: "property" });
  });

  it("detects method context after a value dot, capturing the receiver", () => {
    expect(contextAtEnd("Page.Title.")).toEqual({
      kind: "method",
      receiver: "Page.Title",
      partial: "",
      replaceFrom: 11,
    });
    expect(contextAtEnd("Page.Title.up")).toMatchObject({
      kind: "method",
      receiver: "Page.Title",
      partial: "up",
    });
  });

  it("walks back over balanced calls to find the receiver", () => {
    expect(contextAtEnd("round(Page.Weight).")).toMatchObject({
      kind: "method",
      receiver: "round(Page.Weight)",
    });
    expect(contextAtEnd("Page.Tags.filter(current > 1).")).toMatchObject({
      kind: "method",
      receiver: "Page.Tags.filter(current > 1)",
    });
  });

  it("is 'none' when the caret is not just after a dot", () => {
    expect(contextAtEnd("1 + 2")).toEqual({ kind: "none" });
    expect(contextAtEnd("upper(Page.Title) + 1")).toEqual({ kind: "none" });
    expect(contextAtEnd("")).toEqual({ kind: "none" });
  });

  it("treats a complete Page.Field as property completion (still extendable)", () => {
    expect(contextAtEnd("Page.Title")).toMatchObject({
      kind: "property",
      partial: "Title",
    });
  });
});

describe("isMethodOf", () => {
  it("matches methods by receiver type", () => {
    expect(isMethodOf("upper", "text")).toBe(true);
    expect(isMethodOf("upper", "number")).toBe(false);
    expect(isMethodOf("round", "number")).toBe(true);
    expect(isMethodOf("count", "list")).toBe(true);
  });

  it("offers 'any' methods on every type", () => {
    expect(isMethodOf("format", "number")).toBe(true);
    expect(isMethodOf("toText", "date")).toBe(true);
  });

  it("offers all methods when the receiver type is unknown", () => {
    expect(isMethodOf("upper", "unknown")).toBe(true);
    expect(isMethodOf("round", "unknown")).toBe(true);
  });

  it("never offers control-flow / varargs as methods", () => {
    expect(isMethodOf("if", "text")).toBe(false);
    expect(isMethodOf("concat", "text")).toBe(false);
    expect(isMethodOf("switch", "unknown")).toBe(false);
  });
});
