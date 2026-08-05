/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/layout/theme-provider.tsx";
import {
  DEFAULT_SITE_APPEARANCE,
  type SiteAppearance,
} from "@/lib/schemas/site-appearance.ts";

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  document.documentElement.dataset.tooltipStyle = "";
  document.documentElement.classList.remove("dark");
});

function renderWithAppearance(appearance: SiteAppearance) {
  return render(
    <ThemeProvider
      initialHints={{
        appearance,
        resolvedTheme: appearance.theme === "dark" ? "dark" : "light",
      }}
    >
      <div>app</div>
    </ThemeProvider>
  );
}

describe("ThemeProvider tooltipStyle", () => {
  it("seeds html[data-tooltip-style] from appearance hints", () => {
    renderWithAppearance({
      ...DEFAULT_SITE_APPEARANCE,
      tooltipStyle: "inverted",
    });

    expect(document.documentElement.dataset.tooltipStyle).toBe("inverted");
  });

  it("defaults html[data-tooltip-style] to normal", () => {
    renderWithAppearance(DEFAULT_SITE_APPEARANCE);

    expect(document.documentElement.dataset.tooltipStyle).toBe("normal");
  });
});
