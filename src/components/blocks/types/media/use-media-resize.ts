import { type RefObject, useCallback, useEffect, useState } from "react";

import {
  resolveMediaWidthPercent,
  widthPercentFromCenteredDelta,
} from "@/lib/media/media-resize.ts";

interface UseMediaResizeOptions {
  frameRef: RefObject<HTMLDivElement | null>;
  onWidthChange?: (widthPercent: number) => void;
  widthPercent: number | undefined;
}

export function useMediaResize({
  frameRef,
  onWidthChange,
  widthPercent,
}: UseMediaResizeOptions) {
  const [liveWidthPercent, setLiveWidthPercent] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const baseWidthPercent = resolveMediaWidthPercent(widthPercent);
  const displayWidthPercent = liveWidthPercent ?? baseWidthPercent;

  useEffect(() => {
    if (
      liveWidthPercent !== null &&
      liveWidthPercent === resolveMediaWidthPercent(widthPercent)
    ) {
      setLiveWidthPercent(null);
    }
  }, [liveWidthPercent, widthPercent]);

  const startResize = useCallback(
    (
      anchor: "left" | "right",
      event: React.PointerEvent<HTMLButtonElement>
    ) => {
      if (!onWidthChange) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const frameEl = frameRef.current;
      const rowWidth =
        frameEl?.parentElement?.getBoundingClientRect().width ?? 0;
      if (!(frameEl && rowWidth > 0)) {
        return;
      }

      const startX = event.clientX;
      const startWidthPercent = baseWidthPercent;
      const pendingPercentRef = { current: startWidthPercent };
      const rafRef = { current: null as number | null };

      const applyWidth = (nextPercent: number) => {
        pendingPercentRef.current = nextPercent;
        if (rafRef.current !== null) {
          return;
        }
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          frameEl.style.width = `${pendingPercentRef.current}%`;
        });
      };

      const teardown = (clientX: number) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);

        const deltaPx = clientX - startX;
        const nextWidthPercent = widthPercentFromCenteredDelta({
          anchor,
          containerWidthPx: rowWidth,
          deltaPx,
          startWidthPercent,
        });

        frameEl.style.width = "";
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        setIsResizing(false);
        setLiveWidthPercent(nextWidthPercent);
        onWidthChange(nextWidthPercent);
      };

      const onMove = (moveEvent: PointerEvent) => {
        applyWidth(
          widthPercentFromCenteredDelta({
            anchor,
            containerWidthPx: rowWidth,
            deltaPx: moveEvent.clientX - startX,
            startWidthPercent,
          })
        );
      };

      const onUp = (upEvent: PointerEvent) => {
        teardown(upEvent.clientX);
      };

      const onCancel = () => {
        teardown(startX);
      };

      setIsResizing(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [baseWidthPercent, frameRef, onWidthChange]
  );

  return {
    displayWidthPercent,
    isResizable: Boolean(onWidthChange),
    isResizing,
    startResize,
  };
}
