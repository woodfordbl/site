/**
 * App toast wrapper around Sonner. Every toast gets a stable `id` so repeat
 * triggers update in place; an active duplicate lifts and grows slightly
 * (`cn-toast--retoast`) instead of stacking a second toast.
 */

import type { ReactNode } from "react";
import { type ExternalToast, toast as sonnerToast } from "sonner";

export const RETOAST_CLASS_NAME = "cn-toast--retoast";

type ToastMessage = string | ReactNode;

type ToastType =
  | "default"
  | "success"
  | "error"
  | "info"
  | "warning"
  | "loading"
  | "message";

type AppToastOptions = ExternalToast & {
  id?: string | number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function descriptionFingerprint(
  description: AppToastOptions["description"]
): string {
  if (description === undefined) {
    return "";
  }
  if (typeof description === "function") {
    return "[fn]";
  }
  if (typeof description === "string") {
    return description;
  }
  return "[node]";
}

/** Deterministic fallback when a call site omits an explicit id. */
export function deriveToastId(
  type: ToastType,
  message: ToastMessage,
  options?: AppToastOptions
): string {
  const title = typeof message === "string" ? message : `[${type}]`;
  const description = descriptionFingerprint(options?.description);
  const raw = `${type}:${title}:${description}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index++) {
    hash = (hash * 31 + raw.charCodeAt(index)) % 2_147_483_647;
  }
  return `toast-${hash.toString(36)}`;
}

function resolveToastId(
  type: ToastType,
  message: ToastMessage,
  options?: AppToastOptions
): string | number {
  if (options?.id !== undefined && options.id !== "") {
    return options.id;
  }
  return deriveToastId(type, message, options);
}

function isToastActive(id: string | number): boolean {
  return sonnerToast.getToasts().some((activeToast) => activeToast.id === id);
}

function pulseRetoast(id: string | number): void {
  if (prefersReducedMotion()) {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-sonner-toast][data-toast-id="${CSS.escape(String(id))}"]`
      );
      if (!element) {
        return;
      }

      const handleAnimationEnd = () => {
        element.classList.remove(RETOAST_CLASS_NAME);
        element.removeEventListener("animationend", handleAnimationEnd);
      };

      element.classList.remove(RETOAST_CLASS_NAME);
      element.getBoundingClientRect();
      element.classList.add(RETOAST_CLASS_NAME);
      element.addEventListener("animationend", handleAnimationEnd);
    });
  });
}

function dispatchToast(
  type: ToastType,
  message: ToastMessage,
  options?: AppToastOptions
): string | number {
  const id = resolveToastId(type, message, options);
  const isRetoast = isToastActive(id);
  const mergedOptions: AppToastOptions = { ...options, id };

  let result: string | number;
  switch (type) {
    case "success":
      result = sonnerToast.success(message, mergedOptions);
      break;
    case "error":
      result = sonnerToast.error(message, mergedOptions);
      break;
    case "info":
      result = sonnerToast.info(message, mergedOptions);
      break;
    case "warning":
      result = sonnerToast.warning(message, mergedOptions);
      break;
    case "loading":
      result = sonnerToast.loading(message, mergedOptions);
      break;
    case "message":
      result = sonnerToast.message(message, mergedOptions);
      break;
    default:
      result = sonnerToast.message(message, mergedOptions);
      break;
  }

  if (isRetoast) {
    pulseRetoast(id);
  }

  return result;
}

function defaultToast(
  message: ToastMessage,
  options?: AppToastOptions
): string | number {
  return dispatchToast("message", message, options);
}

export const appToast = Object.assign(defaultToast, {
  success: (message: ToastMessage, options?: AppToastOptions) =>
    dispatchToast("success", message, options),
  error: (message: ToastMessage, options?: AppToastOptions) =>
    dispatchToast("error", message, options),
  info: (message: ToastMessage, options?: AppToastOptions) =>
    dispatchToast("info", message, options),
  warning: (message: ToastMessage, options?: AppToastOptions) =>
    dispatchToast("warning", message, options),
  loading: (message: ToastMessage, options?: AppToastOptions) =>
    dispatchToast("loading", message, options),
  message: (message: ToastMessage, options?: AppToastOptions) =>
    dispatchToast("message", message, options),
  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
});
