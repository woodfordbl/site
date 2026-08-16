import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { localFormulaFunctionsCollection } from "@/db/collections/local-collections.ts";
import { prepareUserFunctions } from "@/lib/formula/user-functions.ts";
import type { FormulaPreparedUserFunctions } from "@/lib/formula/values.ts";
import type { LocalFormulaFunction } from "@/lib/schemas/local-formula-function.ts";

/** Live list of every user-defined formula function definition. */
export function useFormulaFunctionDefs(): LocalFormulaFunction[] {
  const { data: defs = [] } = useLiveQuery((query) =>
    query.from({ fn: localFormulaFunctionsCollection })
  );
  return defs;
}

/**
 * The PREPARED user-function registry (bodies parsed once per definition
 * change), live — the formula editor panel threads it into its check
 * context, preview scope, and reference list. Client-interaction surfaces
 * only (the column menu / formula dialog mount on demand); nothing here
 * runs during SSR.
 */
export function useFormulaUserFunctions(): FormulaPreparedUserFunctions {
  const defs = useFormulaFunctionDefs();
  return useMemo(() => prepareUserFunctions(defs), [defs]);
}
