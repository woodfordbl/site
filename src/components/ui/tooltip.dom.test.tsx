/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

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
  document.documentElement.dataset.tooltipStyle = "normal";
  document.documentElement.classList.remove("dark");
});

beforeEach(() => {
  document.documentElement.dataset.tooltipStyle = "normal";
});

const KBD_BORDER_OVERRIDE = /data-\[slot=kbd\]:border/;
const KBD_BG_BACKGROUND_OVERRIDE = /data-\[slot=kbd\]:bg-background/;

function renderOpenTooltip(children: ReactNode) {
  return render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <TooltipProvider delay={0}>
        <Tooltip defaultOpen>
          <TooltipTrigger render={<button type="button">Trigger</button>} />
          <TooltipContent>{children}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </DeviceLayoutProvider>
  );
}

async function tooltipContent(): Promise<HTMLElement> {
  return await waitFor(() => {
    const node = document.querySelector(
      '[data-slot="tooltip-content"]'
    ) as HTMLElement | null;
    if (!node) {
      throw new Error("tooltip content not mounted");
    }
    return node;
  });
}

describe("TooltipContent surface", () => {
  it("uses popover tokens with soft shadow and no ring in normal mode", async () => {
    document.documentElement.dataset.tooltipStyle = "normal";
    renderOpenTooltip(
      <>
        Add to library
        <Kbd>⌘</Kbd>
      </>
    );

    const content = await tooltipContent();
    expect(content.classList.contains("bg-popover")).toBe(true);
    expect(content.classList.contains("text-popover-foreground")).toBe(true);
    expect(content.classList.contains("shadow-md")).toBe(true);
    expect(content.classList.contains("border")).toBe(false);
    expect(
      [...content.classList].some((token) => token.startsWith("ring"))
    ).toBe(false);

    const keycap = screen.getByText("⌘");
    expect(keycap.classList.contains("bg-muted")).toBe(true);
    expect(keycap.classList.contains("border")).toBe(false);
    // Tooltip must not force bordered / background overrides onto nested Kbds.
    expect(content.className).not.toMatch(KBD_BORDER_OVERRIDE);
    expect(content.className).not.toMatch(KBD_BG_BACKGROUND_OVERRIDE);
  });

  it("uses inverted opposite-of-chrome surface classes when data-tooltip-style is inverted", async () => {
    document.documentElement.dataset.tooltipStyle = "inverted";
    renderOpenTooltip(
      <>
        Drag to resize
        <Kbd>⌘</Kbd>
      </>
    );

    const content = await tooltipContent();
    expect(content.className).toContain(
      "in-[[data-tooltip-style=inverted]]:bg-foreground"
    );
    expect(content.className).toContain(
      "in-[[data-tooltip-style=inverted]]:text-background"
    );
    expect(content.classList.contains("border")).toBe(false);
    expect(
      [...content.classList].some((token) => token.startsWith("ring"))
    ).toBe(false);

    const keycap = screen.getByText("⌘");
    expect(keycap.getAttribute("data-variant")).toBe("outline");
    expect(content.className).toContain(
      "in-[[data-tooltip-style=inverted]]:**:data-[slot=kbd]:data-[variant=outline]:bg-background/20"
    );
    expect(keycap.classList.contains("border")).toBe(false);
  });
});
