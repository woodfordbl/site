import { z } from "zod";

const HTTP_SCHEME_RE = /^https?:\/\//i;

/** Prepends `https://` when pasted input omits a scheme. */
export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (HTTP_SCHEME_RE.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/** Returns whether non-empty user input resolves to a valid URL after normalization. */
export function isValidUrlInput(raw: string): boolean {
  const normalized = normalizeUrlInput(raw);
  if (!normalized) {
    return false;
  }
  return z.url().safeParse(normalized).success;
}

/** Validates trimmed URL input; empty strings fail. Scheme is optional. */
export const urlInputSchema = z.string().refine(isValidUrlInput, {
  message: "Enter a valid URL",
});

export const URL_INPUT_ERROR_MESSAGE = "Enter a valid URL";

export const sourceLinkUrlSchema = z
  .string()
  .trim()
  .refine((raw) => raw.length > 0 && isValidUrlInput(raw), {
    message: URL_INPUT_ERROR_MESSAGE,
  });

export const sourceLinkFormSchema = z.object({
  url: sourceLinkUrlSchema,
});

export type SourceLinkFormValues = z.infer<typeof sourceLinkFormSchema>;

/** Returns normalized URL when input is valid, otherwise null. */
export function parseValidatedUrlInput(raw: string): string | null {
  if (!isValidUrlInput(raw)) {
    return null;
  }
  return normalizeUrlInput(raw);
}
