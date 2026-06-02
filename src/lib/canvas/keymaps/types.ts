import type { KeyboardEvent } from "react";

export interface FieldContext {
  caretAtStart: boolean;
  isEmpty: boolean;
  valueLength: number;
}

export type KeymapResult =
  | { handled: true; caretAtStart: boolean; key: "Backspace" | "Delete" }
  | { handled: false };

export type FieldKeymap = (
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ctx: FieldContext
) => KeymapResult;
