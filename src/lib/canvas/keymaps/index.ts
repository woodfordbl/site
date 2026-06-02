import type { KeyboardEvent } from "react";
import { defaultFieldKeymap } from "@/lib/canvas/keymaps/shared.ts";
import type { FieldContext } from "@/lib/canvas/keymaps/types.ts";

export function resolveFieldCommand(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ctx: FieldContext
) {
  return defaultFieldKeymap(event, ctx);
}
