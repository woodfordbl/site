import { describe, expect, it } from "vitest";
import {
  collectUnmappedStructuralPaths,
  formatSyncBrief,
  isStructuralCodePath,
  suggestHookGateMajorGlobs,
  suggestNewDocTargets,
} from "./docs-sync-brief.mjs";

describe("isStructuralCodePath", () => {
  it("includes lib paths and excludes tests and ui", () => {
    expect(isStructuralCodePath("src/lib/pages/page-icon.ts")).toBe(true);
    expect(isStructuralCodePath("src/lib/pages/page-icon.test.ts")).toBe(false);
    expect(isStructuralCodePath("src/components/ui/button.tsx")).toBe(false);
  });
});

describe("collectUnmappedStructuralPaths", () => {
  const root = process.cwd();

  it("returns empty for mapped pages code", () => {
    expect(
      collectUnmappedStructuralPaths(root, ["src/lib/pages/page-icon.ts"])
    ).toEqual([]);
  });

  it("flags code outside manifest globs", () => {
    const unmapped = collectUnmappedStructuralPaths(root, [
      "src/lib/zzz-future-feature/engine.ts",
    ]);
    expect(unmapped).toContain("src/lib/zzz-future-feature/engine.ts");
  });
});

describe("formatSyncBrief", () => {
  it("includes net-new guidance when unmapped paths exist", () => {
    const unmapped = ["src/lib/zzz-future-feature/engine.ts"];
    const text = formatSyncBrief({
      modifiedPaths: unmapped,
      mappedDocs: [],
      editedDocs: [],
      unmappedStructural: unmapped,
      suggestions: suggestNewDocTargets(unmapped),
      hookGateSuggestions: suggestHookGateMajorGlobs(unmapped),
    });
    expect(text).toContain("new-documentation.md");
    expect(text).toContain("Unmapped structural code");
    expect(text).toContain("docs/architecture/zzz-future-feature.md");
    expect(text).toContain("Hook gate");
    expect(text).toContain("majorGlobs");
  });
});
