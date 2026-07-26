import type { ResolvedTheme } from "@/lib/schemas/site-appearance.ts";

/**
 * Rest browser-chrome tint per theme — the `--background` token as hex (see
 * styles.css). Rendered as `prefers-color-scheme` media metas in __root so the
 * browser picks the right one natively at first paint.
 */
export const THEME_COLOR_BY_APPEARANCE = {
  dark: "#181611",
  light: "#f9f9f5",
} as const;

const IOS_DEVICE_PATTERN = /iP(?:hone|ad|od)/;
/** Chrome/Firefox/Edge/Opera on iOS — WebKit, but their own chrome. */
const IOS_NON_SAFARI_PATTERN = /CriOS|FxiOS|EdgiOS|OPiOS/;

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    IOS_DEVICE_PATTERN.test(ua) ||
    // iPadOS reports a desktop UA; touch points disambiguate it from macOS.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return isIos && !IOS_NON_SAFARI_PATTERN.test(ua);
}

/**
 * Hand the iOS Safari chrome tint back to the document canvas by dropping the
 * `theme-color` metas once the page has painted.
 *
 * In Safari's "Top" tab-bar layout the strips above and below the page — behind
 * the address bar and the toolbar — are browser chrome, not page. While a
 * `theme-color` meta exists Safari tints them from it, and it reads that value
 * ONCE per navigation: rewriting `content` from JS (or swapping the element) is
 * ignored, verified on iOS 26 with a `#ff0000` probe that never appeared. So the
 * bands sat frozen at `--background` while the mobile sidebar reveal slid
 * `--sidebar` in underneath them, drawing a seam along the page's top and bottom
 * edges.
 *
 * With no `theme-color` at all, Safari falls back to the document canvas
 * background — which it *does* track live. That canvas is exactly what
 * `--sidebar-reveal` already animates (styles.css), so the bands then fade with
 * the swipe and match the page edge in every state, at rest and mid-drag. The
 * SSR metas still own first paint; this only runs after hydration.
 *
 * Scoped to iOS Safari: everywhere else `theme-color` is the only tint signal
 * there is, so the metas stay.
 */
export function releaseBrowserChromeTintToCanvas(): void {
  if (!isIosSafari()) {
    return;
  }

  removeThemeColorMetas();
}

function removeThemeColorMetas(): void {
  for (const meta of document.head.querySelectorAll(
    'meta[name="theme-color"]'
  )) {
    meta.remove();
  }
}

/**
 * Kick Safari into re-sampling the canvas after the theme changes.
 *
 * Safari re-reads the canvas off touch events and paints driven by them, so a
 * theme flip that nobody touched — the system going dark at sunset, or the
 * appearance switch in settings — repaints the page but leaves the chrome bands
 * on their last sampled color. That is how a light page ends up framed by black
 * bands until the next tap. Inserting a `theme-color` meta and pulling it back
 * out forces Safari to re-evaluate where its tint comes from, and it lands back
 * on the (now current) canvas. The meta carries the new theme's rest color so
 * the single frame it exists for is already the right one.
 */
export function refreshBrowserChromeTint(resolvedTheme: ResolvedTheme): void {
  if (!isIosSafari()) {
    return;
  }

  removeThemeColorMetas();

  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = THEME_COLOR_BY_APPEARANCE[resolvedTheme];
  document.head.append(meta);

  requestAnimationFrame(() => meta.remove());
}
