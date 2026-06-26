import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  type PageCanvasFooterActionsInput,
  usePageCanvasFooterActions,
} from "@/hooks/use-page-canvas-footer-actions.ts";

export type PageCanvasFooterProps = PageCanvasFooterActionsInput;

export function PageCanvasFooter(props: PageCanvasFooterProps) {
  const {
    confirmAction,
    handleConfirm,
    hasLocalChanges,
    hasUpdates,
    isDev,
    saveStatus,
    setConfirmAction,
    visible,
  } = usePageCanvasFooterActions(props);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
      {saveStatus ? (
        <span className="text-muted-foreground text-xs">{saveStatus}</span>
      ) : null}
      {hasUpdates ? (
        <Button
          onClick={() => setConfirmAction("refresh")}
          size="xs"
          type="button"
          variant="secondary"
        >
          Refresh site content
        </Button>
      ) : null}
      {isDev ? (
        <Button
          onClick={() => setConfirmAction("saveAll")}
          size="xs"
          type="button"
          variant="outline"
        >
          Save all
        </Button>
      ) : null}
      {hasLocalChanges ? (
        <>
          <Button
            onClick={() => setConfirmAction("reset")}
            size="xs"
            type="button"
            variant="outline"
          >
            Reset page
          </Button>
          <Button
            onClick={() => setConfirmAction("resetAll")}
            size="xs"
            type="button"
            variant="outline"
          >
            Reset all
          </Button>
        </>
      ) : null}
      <PageCanvasConfirmDialog
        confirmAction={confirmAction}
        onConfirm={handleConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
      />
    </div>
  );
}
