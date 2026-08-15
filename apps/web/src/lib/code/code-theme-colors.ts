import type { FormulaHighlightKind } from "@/lib/formula/highlight.ts";

/**
 * Resolves the formula editor's token colors out of a Shiki (TextMate) theme,
 * so picking one theme recolors BOTH surfaces: Shiki paints fenced code
 * blocks itself, and the formula editor — which has its own tokenizer, not a
 * TextMate grammar — reads the same theme through here.
 *
 * The mapping is by scope name: each formula token kind names the TextMate
 * scopes it is morally equivalent to, most specific first, and the first one
 * the theme defines wins. Themes vary in how much they specify, hence the
 * fallback chains (`keyword.operator` → `keyword`, and so on).
 */

/** The shape we need from a Shiki theme; deliberately structural. */
export interface ShikiThemeLike {
  readonly colors?: Record<string, string>;
  readonly tokenColors?: readonly {
    readonly scope?: string | readonly string[];
    readonly settings?: { readonly foreground?: string };
  }[];
  readonly type?: string;
}

export interface CodeThemeColors {
  /** `editor.background`, for the code surface. */
  readonly background: string | undefined;
  /** `editor.foreground`, and the fallback for any unresolved token kind. */
  readonly foreground: string | undefined;
  readonly tokens: Record<FormulaHighlightKind, string | undefined>;
}

/**
 * Scope candidates per formula token kind, most specific first. Two notes on
 * the choices: formula `literal` covers the word constants (`true`, `false`,
 * `blank`), which TextMate calls `constant.language`; `property` covers
 * `thisPage.X` member text, closest to an object property reference.
 */
const KIND_SCOPES: Record<FormulaHighlightKind, readonly string[]> = {
  comment: ["comment"],
  function: ["entity.name.function", "support.function", "meta.function-call"],
  literal: ["constant.language", "keyword.control", "keyword"],
  name: [
    "variable.other.readwrite",
    "variable.other",
    "variable",
    "variable.parameter",
  ],
  number: ["constant.numeric", "constant"],
  operator: ["keyword.operator", "keyword"],
  property: [
    "variable.other.property",
    "support.variable.property",
    "variable.other.member",
    // Catppuccin (and others) only colour the readwrite variant, and a rule
    // for a MORE specific scope never satisfies a broader query, so bare
    // `variable` would miss there. Ask for it explicitly before giving up.
    "variable.other.readwrite",
    "variable",
  ],
  string: ["string.quoted.double", "string.quoted", "string"],
};

/**
 * Split a theme rule's scope field into individual scopes. Themes write these
 * as a string, a comma-joined string, or an array — all three appear in the
 * bundled set.
 */
function ruleScopes(scope: string | readonly string[] | undefined): string[] {
  if (scope === undefined) {
    return [];
  }
  const list: readonly string[] = Array.isArray(scope) ? scope : [scope];
  return list.flatMap((entry) =>
    entry
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
  );
}

/**
 * TextMate scope matching: a rule for `string` applies to `string.quoted.double`,
 * and the most specific matching rule wins. Returns the foreground for `query`,
 * or undefined when no rule covers it.
 */
function foregroundForScope(
  theme: ShikiThemeLike,
  query: string
): string | undefined {
  let best: { color: string; length: number } | undefined;
  for (const rule of theme.tokenColors ?? []) {
    const color = rule.settings?.foreground;
    if (color === undefined) {
      continue;
    }
    for (const scope of ruleScopes(rule.scope)) {
      // `scope` covers `query` when it is `query` or a dotted prefix of it.
      const covers = query === scope || query.startsWith(`${scope}.`);
      if (covers && (best === undefined || scope.length > best.length)) {
        best = { color, length: scope.length };
      }
    }
  }
  return best?.color;
}

/**
 * Resolve every formula token kind against `theme`. Unresolved kinds come back
 * undefined so callers can fall back to the app's own colors rather than
 * inventing one.
 */
export function resolveCodeThemeColors(theme: ShikiThemeLike): CodeThemeColors {
  const tokens = {} as Record<FormulaHighlightKind, string | undefined>;
  for (const kind of Object.keys(KIND_SCOPES) as FormulaHighlightKind[]) {
    let resolved: string | undefined;
    for (const scope of KIND_SCOPES[kind]) {
      resolved = foregroundForScope(theme, scope);
      if (resolved !== undefined) {
        break;
      }
    }
    tokens[kind] = resolved;
  }
  return {
    background: theme.colors?.["editor.background"],
    foreground: theme.colors?.["editor.foreground"],
    tokens,
  };
}

/** CSS custom property carrying one token kind's color. */
export function codeThemeTokenVariable(kind: FormulaHighlightKind): string {
  return `--code-token-${kind}`;
}

/**
 * The `:root` / `.dark` rule text publishing a resolved pair as CSS variables.
 * Emitted as one stylesheet (rather than inline styles) so both modes can be
 * declared at once and the workspace theme toggle picks between them with no
 * JS involvement.
 */
export function codeThemeStyleSheet(
  light: CodeThemeColors,
  dark: CodeThemeColors
): string {
  const declarations = (colors: CodeThemeColors): string => {
    const lines: string[] = [];
    if (colors.foreground !== undefined) {
      lines.push(`--code-foreground: ${colors.foreground};`);
    }
    if (colors.background !== undefined) {
      lines.push(`--code-background: ${colors.background};`);
    }
    for (const kind of Object.keys(KIND_SCOPES) as FormulaHighlightKind[]) {
      const color = colors.tokens[kind];
      if (color !== undefined) {
        lines.push(`${codeThemeTokenVariable(kind)}: ${color};`);
      }
    }
    return lines.join("");
  };
  return `:root{${declarations(light)}}.dark{${declarations(dark)}}`;
}
