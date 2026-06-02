import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { assertNever } from "@/lib/canvas/commands.ts";
import type {
  CanvasEffect,
  CanvasPersistenceApi,
  FocusState,
} from "@/lib/canvas/effects.ts";

export function applyCanvasEffects(
  effects: CanvasEffect[],
  api: CanvasPersistenceApi,
  _rows: CanvasRow[],
  setFocus: (focus: FocusState) => void
): void {
  const pendingFocus: FocusState[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case "persist": {
        api.saveRow(effect.rowId, effect.block);
        break;
      }
      case "insert": {
        const newRowId = api.insertRow(effect.position, effect.block);
        if (effect.focus) {
          setFocus({ rowId: newRowId, placement: "start", offset: 0 });
        }
        break;
      }
      case "delete": {
        api.deleteRow(effect.rowId);
        break;
      }
      case "move": {
        api.moveRow(effect.rowId, effect.position);
        break;
      }
      case "focus": {
        pendingFocus.push({
          rowId: effect.rowId,
          placement: effect.placement,
          offset: effect.offset,
        });
        break;
      }
      case "page.revertToServer": {
        api.revertToServer();
        break;
      }
      case "page.acknowledgeServerBaseline": {
        api.acknowledgeServerBaseline();
        break;
      }
      case "author.save": {
        api
          .saveAuthorPage(
            effect.pageId,
            effect.blocks,
            effect.title,
            effect.slug
          )
          .catch(() => undefined);
        break;
      }
      default: {
        assertNever(effect);
      }
    }
  }

  const focusRequest = pendingFocus.at(-1) ?? null;
  if (focusRequest) {
    setFocus(focusRequest);
  }
}
