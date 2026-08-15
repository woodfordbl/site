import { z } from "zod";

/**
 * One named user-defined formula function (Sheets Named Functions model —
 * proposal §9 P5), stored once at WORKSPACE level like keybindings: any
 * formula in any database can call it. `name` must be identifier-safe and
 * globally unique case-insensitively — enforced by the ops layer
 * (`db/queries/formula-function-ops.ts`) via the pure validators in
 * `lib/formula/user-functions.ts`, not by the schema (stored rows that
 * predate a rule change must still parse). `expression` is the body in
 * canonical stored text (`prop("<id>")` / `db("<id>")` references legal),
 * evaluated with `params` bound to each call's arguments.
 */
export const localFormulaFunctionSchema = z.object({
  createdAt: z.string(),
  description: z.string().optional(),
  expression: z.string(),
  id: z.string(),
  name: z.string().min(1),
  params: z.array(z.string()),
  updatedAt: z.string(),
});

export type LocalFormulaFunction = z.infer<typeof localFormulaFunctionSchema>;
