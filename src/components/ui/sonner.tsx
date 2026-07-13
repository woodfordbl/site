"use client";

import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader,
  IconX,
} from "@tabler/icons-react";
import { useLayoutEffect } from "react";
import { Toaster as Sonner, type ToasterProps, useSonner } from "sonner";
import { buttonVariants } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const DEFAULT_TOASTER_POSITION = "bottom-right";

const toastCloseButtonClassName = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "cn-toast-close rounded-full"
);

const toastActionButtonClassName = cn(
  buttonVariants({ variant: "ghost", size: "xs" }),
  "cn-toast-action"
);

const toastCancelButtonClassName = cn(
  buttonVariants({ variant: "secondary", size: "xs" }),
  "cn-toast-cancel"
);

/** Stamps `data-toast-id` on toast nodes until Sonner ships it upstream. */
function ToastDomSync() {
  const { toasts } = useSonner();

  useLayoutEffect(() => {
    const possiblePositions = Array.from(
      new Set([
        DEFAULT_TOASTER_POSITION,
        ...toasts
          .map((activeToast) => activeToast.position)
          .filter((position): position is NonNullable<typeof position> =>
            Boolean(position)
          ),
      ])
    );

    const lists = document.querySelectorAll<HTMLElement>(
      "[data-sonner-toaster]"
    );
    for (const list of lists) {
      const yPosition = list.getAttribute("data-y-position");
      const xPosition = list.getAttribute("data-x-position");
      if (!(yPosition && xPosition)) {
        continue;
      }

      const listPosition = `${yPosition}-${xPosition}`;
      const listIndex = possiblePositions.indexOf(listPosition);
      if (listIndex === -1) {
        continue;
      }

      const positionToasts = toasts.filter(
        (activeToast) =>
          (!activeToast.position && listIndex === 0) ||
          activeToast.position === listPosition
      );

      const nodes = list.querySelectorAll<HTMLElement>("[data-sonner-toast]");
      for (const [index, node] of nodes.entries()) {
        const activeToast = positionToasts[index];
        if (activeToast) {
          node.dataset.toastId = String(activeToast.id);
        } else {
          delete node.dataset.toastId;
        }
      }
    }
  }, [toasts]);

  return null;
}

const Toaster = ({ ...props }: ToasterProps) => (
  <>
    <Sonner
      className="toaster group"
      icons={{
        close: <IconX className="text-current" />,
        success: <IconCircleCheck className="size-4 stroke-[1.5px]" />,
        info: <IconInfoCircle className="size-4 stroke-[1.5px]" />,
        warning: <IconAlertTriangle className="size-4 stroke-[1.5px]" />,
        error: <IconAlertOctagon className="size-4 stroke-[1.5px]" />,
        loading: <IconLoader className="size-4 animate-spin stroke-[1.5px]" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
          "--width": "22rem",
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "unset",
          "--toast-close-button-transform": "none",
          "--toast-button-margin-start": "0",
          "--toast-button-margin-end": "0",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "cn-toast",
          title: "cn-toast-title",
          description: "cn-toast-description",
          content: "cn-toast-content",
          icon: "cn-toast-icon",
          loader: "cn-toast-loader",
          closeButton: toastCloseButtonClassName,
          actionButton: toastActionButtonClassName,
          cancelButton: toastCancelButtonClassName,
        },
      }}
      {...props}
    />
    <ToastDomSync />
  </>
);

export { Toaster };
