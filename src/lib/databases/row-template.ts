import {
  type CreateRowScopeOptions,
  createRowScope,
} from "@/lib/expr/row-scope.ts";
import { evaluateTemplateText } from "@/lib/expr/template.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

/**
 * Row-page template instantiation: turns a database's shared row template
 * (a flat page-shaped `Block[]` with `parentId` links, stored in the sentinel
 * template page's block shard — see `row-template-store.ts`) into concrete
 * blocks for ONE row by evaluating every `{{ … }}` expression token in the
 * blocks' user-visible text props against that row's values.
 *
 * Used in two places:
 * - **Virtual rendering** — the `/db/$databaseId/$rowId` route instantiates
 *   per render so every row "has" a page with zero per-row storage.
 * - **Copy-on-write materialization** — when the user first edits a row's
 *   page, the instantiated blocks (tokens evaluated, a SNAPSHOT of the row's
 *   values at that moment) seed a real user page. Live-token rendering
 *   inside real pages is a future phase; materialized text does not update
 *   when row values change.
 */

/** Field names safe for the dot form (`thisPage.Name`) of a property token. */
const IDENTIFIER_SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Canonical `{{ … }}` token referencing a field by name: the dot form for
 * identifier-safe names, the quoted bracket form (`thisPage["Start date"]`)
 * otherwise. Shared by the editor's copy-token affordance and (future) token
 * autocomplete so inserted tokens always parse.
 */
export function rowPropertyToken(fieldName: string): string {
  const name = fieldName.trim();
  if (IDENTIFIER_SAFE_NAME.test(name)) {
    return `{{ thisPage.${name} }}`;
  }
  return `{{ thisPage["${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"] }}`;
}

/**
 * Fixed id for the default template's single block — the default template is
 * rebuilt per call, and a stable id keeps virtual re-renders from remounting
 * the row. Materialization remaps ids (`clonePageBlocks`), so real pages
 * never collide on it.
 */
const DEFAULT_ROW_TEMPLATE_BLOCK_ID = "row-template-default-text";

/**
 * The fallback template: a single EMPTY text block, so a row with no custom
 * template opens as a blank page (no "edit this page" placeholder copy) that
 * reads and behaves like any freshly-created page. The empty trailing row is
 * also the click target that starts editing (copy-on-write materialization).
 */
export function defaultRowTemplateBlocks(): Block[] {
  return [
    {
      id: DEFAULT_ROW_TEMPLATE_BLOCK_ID,
      type: "text",
      props: { text: "" },
    },
  ];
}

/**
 * Which props carry user-visible display text, per block type — the props
 * `{{ … }}` tokens are evaluated in. Deliberately excluded:
 * - `code.text` — code stays literal; tokens in source are content.
 * - `embed.url`/`title`/`description`/`imageUrl` — provider/OG metadata, not
 *   authored prose (only the authored `caption` evaluates).
 * - `media.alt`/`fileName`/`src` — asset metadata, not display text.
 * - `pageLink`/`database` props — ids, never text.
 */
const TEMPLATE_TEXT_PROP_KEYS: Partial<Record<BlockType, readonly string[]>> = {
  text: ["text"],
  heading: ["text"],
  toggleHeading: ["text"],
  quote: ["text"],
  checklistItem: ["text"],
  tableCell: ["text"],
  tab: ["label"],
  embed: ["caption"],
};

/** Options for {@link instantiateTemplateBlocks}. */
export interface InstantiateTemplateBlocksOptions {
  /**
   * Injected clock for `now()`/`today()` in tokens. Omit for the expression
   * engine's deterministic fixed epoch (tests); UI callers pass the real
   * clock.
   */
  now?: CreateRowScopeOptions["now"];
}

/**
 * Instantiate a row-page template for one row: deep-map the flat block array,
 * evaluating `{{ thisPage.X }}` tokens in every user-visible text prop
 * ({@link TEMPLATE_TEXT_PROP_KEYS}) via `evaluateTemplateText` +
 * `createRowScope`. Ids, `parentId` links, and all non-text props pass
 * through untouched; the input template is never mutated (changed blocks are
 * rebuilt, unchanged blocks are returned as-is). An absent or empty template
 * falls back to {@link defaultRowTemplateBlocks}. Evaluation errors render
 * inline ("⚠ message") — never thrown.
 */
export function instantiateTemplateBlocks(
  template: Block[] | undefined,
  fields: DatabaseField[],
  values: Record<string, DatabaseCellValue>,
  opts?: InstantiateTemplateBlocksOptions
): Block[] {
  const source =
    template !== undefined && template.length > 0
      ? template
      : defaultRowTemplateBlocks();
  const scope = createRowScope(
    fields,
    values,
    opts?.now === undefined ? undefined : { now: opts.now }
  );

  return source.map((block) => {
    const keys = TEMPLATE_TEXT_PROP_KEYS[block.type];
    if (!keys) {
      return block;
    }

    const props = block.props as Record<string, unknown>;
    let changed = false;
    const nextProps: Record<string, unknown> = { ...props };
    for (const key of keys) {
      const raw = props[key];
      // Cheap gate: plain strings with no opening delimiter can't change.
      if (typeof raw === "string" && raw.includes("{{")) {
        nextProps[key] = evaluateTemplateText(raw, scope);
        changed = true;
      }
    }

    return changed ? ({ ...block, props: nextProps } as Block) : block;
  });
}
