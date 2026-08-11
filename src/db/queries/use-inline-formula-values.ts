import { useEffect, useMemo, useState } from "react";

import { subscribeFormulaEngine } from "@/db/formula-engine.ts";
import { useAllDatabases } from "@/db/queries/use-database.ts";
import { useFormulaUserFunctions } from "@/db/queries/use-formula-functions.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import { formulaCheckContext } from "@/lib/databases/formula-values.ts";
import {
  evaluateInlineTokens,
  type InlineTokenEvaluation,
} from "@/lib/formula/inline-token-eval.ts";
import {
  createPageFormulaScope,
  type PageFormulaSource,
  pageFormulaCheckProperties,
} from "@/lib/formula/page-scope.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

/**
 * Rendered values for a block's inline formula tokens, live.
 *
 * Thin by design: `evaluateInlineTokens` does the work and reports which
 * databases the tokens read, and this hook subscribes to exactly those — not to
 * the whole workspace, which is how a page full of tokens avoids re-rendering
 * on every unrelated keystroke.
 *
 * Nothing here writes to the document. Values are render state keyed by each
 * token's offset, so a refresh never touches `props.text`, undo history, or the
 * conflict baseline (see `docs/proposals/inline-prose-tokens.md`).
 */

/** Matches the engine's own volatile cadence. */
const CLOCK_REFRESH_MS = 60_000;

/** No page fields available (a block rendered outside a page context). */
const EMPTY_VALUES: ReadonlyMap<number, string> = new Map();

/**
 * A 60s tick while `ticking`, paused when the tab is hidden and refreshed on
 * return — the same treatment the table view gives relative dates, so a
 * background tab costs nothing.
 */
function useVolatileClock(ticking: boolean): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ticking) {
      return;
    }
    let intervalId: number | undefined;
    const stop = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const start = () => {
      intervalId ??= window.setInterval(() => {
        setTick((previous) => previous + 1);
      }, CLOCK_REFRESH_MS);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setTick((previous) => previous + 1);
        start();
      }
    };
    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ticking]);

  return tick;
}

export function useInlineFormulaValues(
  page: PageFormulaSource | null,
  marks: readonly InlineMark[]
): ReadonlyMap<number, string> {
  const databases = useAllDatabases();
  const userFunctions = useFormulaUserFunctions();
  /** Bumped by the engine when a referenced database changes. */
  const [revision, setRevision] = useState(0);

  /**
   * Content identity of the field's tokens. Callers rebuild their mark array
   * every render, so memoizing on `marks` itself would re-evaluate every token
   * on every keystroke — including keystrokes nowhere near one.
   */
  const signature = marks
    .filter((mark) => mark.type === "formula")
    // JSON-quoted so no expression can forge the separator.
    .map((mark) => `${mark.start}:${JSON.stringify(mark.expression ?? "")}`)
    .join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: signature is the content identity of marks; depending on the array itself defeats the memo
  const tokens = useMemo(
    () => marks.filter((mark) => mark.type === "formula"),
    [signature]
  );
  const hasTokens = tokens.length > 0;

  const context = useMemo(
    () =>
      formulaCheckContext(
        // Base page fields stand in for a database's columns; `db("…")` reads
        // the workspace list, exactly as a column formula does.
        [],
        databases.map((database) => ({
          id: database.id,
          name: database.name,
          fields: database.fields,
        })),
        userFunctions
      ),
    [databases, userFunctions]
  );

  /** Page fields merged into the check context so `thisPage.X` types. */
  const pageContext = useMemo(
    () => ({ ...context, properties: pageFormulaCheckProperties() }),
    [context]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the engine's "re-read the collections" signal, not an input the body reads
  const evaluation = useMemo<InlineTokenEvaluation | null>(() => {
    if (!hasTokens || page === null) {
      return null;
    }
    const scope = createPageFormulaScope(page, {
      now: () => new Date(),
      relations: localFormulaRelationResolver({ now: () => new Date() }),
      userFunctions,
    });
    return evaluateInlineTokens(tokens, scope, pageContext);
    // `revision` and the clock tick are inputs: both mean "re-read the world".
  }, [hasTokens, page, tokens, pageContext, userFunctions, revision]);

  const tick = useVolatileClock(evaluation?.volatile === true);
  // Re-evaluate on the tick without making it a second memo.
  useEffect(() => {
    if (tick > 0) {
      setRevision((previous) => previous + 1);
    }
  }, [tick]);

  /**
   * Stable key for the subscription set — a fresh Set every evaluation would
   * re-subscribe on every render.
   */
  const databaseKey = useMemo(
    () => [...(evaluation?.databaseIds ?? [])].sort().join(","),
    [evaluation]
  );

  useEffect(() => {
    if (databaseKey === "") {
      return;
    }
    const unsubscribes = databaseKey.split(",").map((databaseId) =>
      subscribeFormulaEngine(databaseId, () => {
        setRevision((previous) => previous + 1);
      })
    );
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [databaseKey]);

  return evaluation?.values ?? EMPTY_VALUES;
}
