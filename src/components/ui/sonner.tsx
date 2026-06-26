"use client";

import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader,
  IconX,
} from "@tabler/icons-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { buttonVariants } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

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

const Toaster = ({ ...props }: ToasterProps) => (
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
);

export { Toaster };
