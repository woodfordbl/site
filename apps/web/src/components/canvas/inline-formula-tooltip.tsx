import { useEffect, useRef, useState } from "react";
import { useIsCoarsePrimaryPointer } from "@/components/layout/device-layout-provider.tsx";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip.tsx";
import { FORMULA_TOKEN_SELECTOR } from "@/lib/editor/rich-text-dom.ts";

/**
 * Hover hint on an inline formula token: what clicking it does, and the
 * expression behind the value on screen.
 *
 * One instance per canvas, delegated like {@link InlineFormulaPopover}, for the
 * same reason: tokens live in field-owned DOM that is rebuilt on every
 * keystroke, so React never holds them and cannot wrap each in a trigger.
 *
 * This replaces the native `title` the token used to carry — a browser tooltip
 * arrives late, in the OS's chrome, and cannot say what the click does.
 */

/**
 * Shorter than the design-system default: a token is a small target the reader
 * has to aim at, so the hover is already deliberate by the time it lands.
 */
const TOKEN_TOOLTIP_DELAY_MS = 400;

interface TokenHint {
  element: HTMLElement;
  expression: string;
}

/** Tokens in an editable field only — a read-only token has nothing to edit. */
function resolveEditableToken(target: EventTarget | null): TokenHint | null {
  const element = target instanceof Element ? target : null;
  const token = element?.closest(FORMULA_TOKEN_SELECTOR);
  if (
    !(token instanceof HTMLElement && token.closest("[data-rich-text-field]"))
  ) {
    return null;
  }
  return { element: token, expression: token.dataset.expression ?? "" };
}

export function InlineFormulaTokenTooltip() {
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const [hint, setHint] = useState<TokenHint | null>(null);
  /** The token the open timer is running for — also the one already shown. */
  const pendingRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isCoarsePointer) {
      return;
    }

    const clearOpenTimer = () => {
      if (openTimerRef.current !== null) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
    };
    const dismiss = () => {
      clearOpenTimer();
      pendingRef.current = null;
      setHint(null);
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const next = resolveEditableToken(event.target);
      if (!next) {
        dismiss();
        return;
      }
      // Moving within the same token — including onto its value span — is not
      // a new hover, and must not restart the delay.
      if (pendingRef.current === next.element) {
        return;
      }
      clearOpenTimer();
      pendingRef.current = next.element;
      setHint(null);
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setHint(next);
      }, TOKEN_TOOLTIP_DELAY_MS);
    };
    // Any press dismisses: the click opens the editor panel, and the hint has
    // no business sitting over it.
    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerdown", dismiss, true);
    return () => {
      clearOpenTimer();
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerdown", dismiss, true);
    };
  }, [isCoarsePointer]);

  // A token's rect is only valid until the page moves under it.
  useEffect(() => {
    if (hint === null) {
      return;
    }
    const close = () => {
      pendingRef.current = null;
      setHint(null);
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [hint]);

  if (isCoarsePointer || hint === null) {
    return null;
  }

  return (
    <Tooltip open>
      <TooltipContent
        anchor={hint.element}
        className="flex-col items-start gap-0.5"
      >
        <span className="font-medium">Edit formula</span>
        {hint.expression ? (
          <span className="code-no-ligatures max-w-full truncate font-mono text-[11px] opacity-70">
            {hint.expression}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
