import { describe, expect, it } from "vitest";

import {
  codeThemeStyleSheet,
  codeThemeTokenVariable,
  resolveCodeThemeColors,
  type ShikiThemeLike,
} from "@/lib/code/code-theme-colors.ts";

const THEME: ShikiThemeLike = {
  colors: { "editor.background": "#ffffff", "editor.foreground": "#000000" },
  tokenColors: [
    { scope: "comment", settings: { foreground: "#008000" } },
    { scope: "string", settings: { foreground: "#a31515" } },
    { scope: "constant.numeric", settings: { foreground: "#098658" } },
    { scope: "keyword.operator", settings: { foreground: "#111111" } },
    { scope: "entity.name.function", settings: { foreground: "#795e26" } },
    { scope: "variable", settings: { foreground: "#001080" } },
    { scope: "constant.language", settings: { foreground: "#0000ff" } },
  ],
  type: "light",
};

describe("resolveCodeThemeColors", () => {
  it("maps each formula token kind onto its TextMate scope", () => {
    const { tokens } = resolveCodeThemeColors(THEME);
    expect(tokens.comment).toBe("#008000");
    expect(tokens.string).toBe("#a31515");
    expect(tokens.number).toBe("#098658");
    expect(tokens.operator).toBe("#111111");
    expect(tokens.function).toBe("#795e26");
    expect(tokens.name).toBe("#001080");
    expect(tokens.literal).toBe("#0000ff");
  });

  it("reads the editor surface colors", () => {
    const colors = resolveCodeThemeColors(THEME);
    expect(colors.foreground).toBe("#000000");
    expect(colors.background).toBe("#ffffff");
  });

  it("matches a rule scope against more specific queries (TextMate prefix)", () => {
    // `string.quoted.double` is queried first; only `string` is defined.
    const { tokens } = resolveCodeThemeColors(THEME);
    expect(tokens.string).toBe("#a31515");
  });

  it("prefers the most specific rule when several cover a query", () => {
    const theme: ShikiThemeLike = {
      tokenColors: [
        { scope: "string", settings: { foreground: "#aaaaaa" } },
        { scope: "string.quoted.double", settings: { foreground: "#bbbbbb" } },
      ],
    };
    expect(resolveCodeThemeColors(theme).tokens.string).toBe("#bbbbbb");
  });

  it("splits comma-joined and array scope fields", () => {
    const comma: ShikiThemeLike = {
      tokenColors: [
        { scope: "comment, punctuation", settings: { foreground: "#cccccc" } },
      ],
    };
    expect(resolveCodeThemeColors(comma).tokens.comment).toBe("#cccccc");

    const array: ShikiThemeLike = {
      tokenColors: [
        { scope: ["meta", "comment"], settings: { foreground: "#dddddd" } },
      ],
    };
    expect(resolveCodeThemeColors(array).tokens.comment).toBe("#dddddd");
  });

  it("falls back down the chain, then to undefined", () => {
    // Only `keyword` defined: `operator` falls back to it, `string` finds none.
    const sparse: ShikiThemeLike = {
      tokenColors: [{ scope: "keyword", settings: { foreground: "#eeeeee" } }],
    };
    const { tokens } = resolveCodeThemeColors(sparse);
    expect(tokens.operator).toBe("#eeeeee");
    expect(tokens.string).toBeUndefined();
  });

  it("never matches a sibling scope that merely shares a prefix string", () => {
    // `stringify` must NOT satisfy a `string` query.
    const sibling: ShikiThemeLike = {
      tokenColors: [
        { scope: "stringify", settings: { foreground: "#ffffff" } },
      ],
    };
    expect(resolveCodeThemeColors(sibling).tokens.string).toBeUndefined();
  });

  it("resolves `property` from the readwrite variant when bare `variable` is absent", () => {
    // Catppuccin's shape: only `variable.other.readwrite` is coloured. A rule
    // for a MORE specific scope must not satisfy a broader `variable` query,
    // so the chain has to ask for the readwrite variant by name.
    const catppuccinish: ShikiThemeLike = {
      tokenColors: [
        {
          scope: "variable.other.readwrite",
          settings: { foreground: "#4c4f69" },
        },
      ],
    };
    expect(resolveCodeThemeColors(catppuccinish).tokens.property).toBe(
      "#4c4f69"
    );
  });

  it("tolerates a theme with no token colors at all", () => {
    const { tokens } = resolveCodeThemeColors({});
    expect(tokens.operator).toBeUndefined();
    expect(resolveCodeThemeColors({}).foreground).toBeUndefined();
  });
});

describe("codeThemeStyleSheet", () => {
  it("declares light on :root and dark on .dark, skipping unresolved kinds", () => {
    const light = resolveCodeThemeColors(THEME);
    const dark = resolveCodeThemeColors({
      colors: { "editor.foreground": "#eeeeee" },
      tokenColors: [{ scope: "comment", settings: { foreground: "#777777" } }],
    });
    const css = codeThemeStyleSheet(light, dark);

    expect(css).toContain(":root{");
    expect(css).toContain(".dark{");
    expect(css).toContain(`${codeThemeTokenVariable("comment")}: #008000;`);
    expect(css).toContain(`${codeThemeTokenVariable("comment")}: #777777;`);
    // The dark theme resolves no operator, so no declaration is emitted.
    const darkBlock = css.slice(css.indexOf(".dark{"));
    expect(darkBlock).not.toContain(codeThemeTokenVariable("operator"));
  });
});
