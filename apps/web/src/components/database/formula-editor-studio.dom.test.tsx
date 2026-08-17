/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import { preloadFormulaCodeEditor } from "@/components/database/preload-formula-code-editor.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

// The studio is a coarse-pointer surface; stubbed so no DeviceLayoutProvider
// or matchMedia is needed.
const pointer = vi.hoisted(() => ({ coarse: true }));
vi.mock("@/components/layout/device-layout-provider.tsx", () => ({
  useIsCoarsePrimaryPointer: () => pointer.coarse,
}));

// The studio mounts CM6 even on coarse pointers; keep the lazy editor
// suspended so the Suspense fallback textarea stays the editing surface
// deterministically (otherwise the chunk resolves mid-test and swaps
// surfaces under the assertions).
const cm6 = vi.hoisted(() => ({ suppressMount: false }));
vi.mock(
  "@/components/database/formula-code-editor.tsx",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/database/formula-code-editor.tsx")
      >();
    const react = await import("react");
    /** Never settles — suspends the editor so the fallback textarea persists. */
    const pending = new Promise<never>(() => undefined);
    function SuppressibleFormulaCodeEditor(
      props: Parameters<typeof actual.FormulaCodeEditor>[0]
    ) {
      if (cm6.suppressMount) {
        react.use(pending);
      }
      return react.createElement(actual.FormulaCodeEditor, props);
    }
    return { ...actual, FormulaCodeEditor: SuppressibleFormulaCodeEditor };
  }
);

// The accessory row pins itself above the on-screen keyboard by driving a
// per-frame transform off `visualViewport` — none of which exists in jsdom.
vi.mock("@/hooks/use-visual-viewport-keyboard.ts", () => ({
  useKeyboardToolbarAnchor: () => undefined,
}));

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-qty", name: "Unit Count", type: "number" },
  { id: "f-total", name: "Total", type: "formula", expression: "" },
];

const PREVIEW_ROWS = [
  { id: "row-1", label: "First row", values: { "f-price": 10, "f-qty": 4 } },
];

// Adjacent spans concatenate without spaces in accessible names, hence the
// anchored prefixes rather than whole-string matches.
const STUDIO_PRICE_ROW_RE = /^Price/;
const STUDIO_ABS_ROW_RE = /^abs\(/;
const STUDIO_ABS_DOCS_RE = /absolute value/;
const STUDIO_CONCAT_ROW_RE = /^&Joins values as text/;
const STUDIO_EXPECTS_NUMBER_RE = /expects a number/;
const STUDIO_ISSUE_PILL_RE = /^1 issue/;

/** Flush the panel's rAF-based focus/caret restoration (stubbed to timeouts). */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// Warm the lazy chunk ONCE up front. The panel seeds its editor state from
// an already-resolved import, so with `suppressMount` the CM6 component
// suspends and the Suspense fallback textarea is a stable editing surface for
// the whole file. Cold, the import would instead resolve mid-test and swap
// surfaces under the assertions.
beforeAll(async () => {
  await preloadFormulaCodeEditor();
});

beforeEach(() => {
  pointer.coarse = true;
  cm6.suppressMount = false;
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FormulaEditorPanel — studio layout (mobile full-screen)", () => {
  beforeEach(() => {
    pointer.coarse = true;
    // Keep the CM6 mount suspended so the Suspense fallback textarea is
    // the stable editing surface (see the module mock above).
    cm6.suppressMount = true;
  });

  function renderStudio({ expression = "" } = {}) {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <FormulaEditorPanel
        expression={expression}
        fields={FIELDS}
        layout="studio"
        onCancel={onCancel}
        onSave={onSave}
        previewRows={PREVIEW_ROWS}
        title="Price with tax"
      />
    );
    return { onCancel, onSave };
  }

  async function fire(...events: (() => void)[]): Promise<void> {
    for (const event of events) {
      event();
      await flushFrames();
    }
  }

  it("titles the header with the column name; Done is the only save", async () => {
    renderStudio();
    await flushFrames();

    expect(screen.getByText("Price with tax")).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("inserts a property from the tray's Properties tab", async () => {
    renderStudio();
    await flushFrames();

    await fire(() => {
      fireEvent.click(
        screen.getByRole("button", { name: STUDIO_PRICE_ROW_RE })
      );
    });
    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("thisPage.Price");
  });

  it("Functions tab expands docs in place and inserts on tap", async () => {
    renderStudio();
    await flushFrames();

    await fire(() => {
      fireEvent.click(screen.getByRole("tab", { name: "Functions" }));
    });
    // Docs are hidden until the chevron expands the row.
    expect(screen.queryByText(STUDIO_ABS_DOCS_RE)).toBeNull();
    await fire(() => {
      fireEvent.click(screen.getByRole("button", { name: "abs details" }));
    });
    expect(screen.getByText(STUDIO_ABS_DOCS_RE)).toBeDefined();

    await fire(() => {
      fireEvent.click(screen.getByRole("button", { name: STUDIO_ABS_ROW_RE }));
    });
    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("abs()");
  });

  it("Operators tab inserts the symbol with breathing room", async () => {
    renderStudio();
    await flushFrames();

    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;
    await fire(
      () => {
        fireEvent.change(textarea, { target: { value: "1" } });
      },
      () => {
        fireEvent.click(screen.getByRole("tab", { name: "Operators" }));
      },
      () => {
        fireEvent.click(
          screen.getByRole("button", { name: STUDIO_CONCAT_ROW_RE })
        );
      }
    );
    expect(textarea.value).toBe("1 & ");
  });

  it("shows the plain desktop-style status line, not boxed diagnostics", async () => {
    renderStudio();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    await fire(() => {
      fireEvent.change(textarea, { target: { value: 'abs("oops")' } });
    });
    // The red status line is the whole diagnostics surface — same as the
    // desktop layouts: no tappable rows, no validity pill. (The message
    // also echoes in the preview line, hence the *AllBy* query.)
    expect(
      screen.getAllByText(STUDIO_EXPECTS_NUMBER_RE).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: STUDIO_EXPECTS_NUMBER_RE })
    ).toBeNull();
    expect(screen.queryByText(STUDIO_ISSUE_PILL_RE)).toBeNull();

    await fire(() => {
      fireEvent.change(textarea, { target: { value: "1 + 2" } });
    });
    expect(screen.queryAllByText(STUDIO_EXPECTS_NUMBER_RE)).toHaveLength(0);
    expect(screen.getByText("✓ Valid")).toBeDefined();
  });
});
