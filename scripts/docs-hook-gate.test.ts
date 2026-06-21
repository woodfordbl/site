import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_CHANGED_LINES,
  evaluateDocsHookGate,
  isMajorStructuralPath,
  minChangedLinesThreshold,
} from "./docs-hook-gate.mjs";

describe("isMajorStructuralPath", () => {
  const root = process.cwd();

  it("flags reducer and manifest", () => {
    expect(isMajorStructuralPath(root, "src/lib/canvas/reducer.ts")).toBe(true);
    expect(isMajorStructuralPath(root, "docs/.doc-manifest.json")).toBe(true);
  });

  it("flags mapping-specific majorGlobs", () => {
    expect(
      isMajorStructuralPath(root, "src/lib/pages/reposition-page.ts")
    ).toBe(true);
  });

  it("does not flag ordinary page helpers", () => {
    expect(
      isMajorStructuralPath(root, "src/lib/pages/default-page-title.ts")
    ).toBe(false);
  });
});

describe("minChangedLinesThreshold", () => {
  it("uses default when env unset", () => {
    expect(minChangedLinesThreshold({})).toBe(DEFAULT_MIN_CHANGED_LINES);
  });

  it("reads DOCS_HOOK_MIN_LINES", () => {
    expect(minChangedLinesThreshold({ DOCS_HOOK_MIN_LINES: "3" })).toBe(3);
  });
});

describe("evaluateDocsHookGate", () => {
  const root = process.cwd();

  it("skips when no paths", () => {
    expect(evaluateDocsHookGate(root, []).shouldRun).toBe(false);
  });

  it("runs for major paths even with zero diff", () => {
    const gate = evaluateDocsHookGate(root, ["src/lib/canvas/reducer.ts"], {
      DOCS_HOOK_MIN_LINES: "9999",
    });
    expect(gate.shouldRun).toBe(true);
    expect(gate.reason).toBe("major_path");
  });
});
