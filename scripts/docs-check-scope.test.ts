import { describe, expect, it } from "vitest";
import {
  normalizeModifiedPath,
  parseModifiedFilesArgv,
  resolveCheckScope,
} from "./docs-check-scope.mjs";

describe("parseModifiedFilesArgv", () => {
  it("parses repeated --files and comma-separated values", () => {
    const files = parseModifiedFilesArgv(
      [
        "--files",
        "src/lib/pages/a.ts,src/lib/pages/b.ts",
        "--files",
        "docs/architecture/pages.md",
      ],
      {}
    );
    expect(files).toEqual([
      "src/lib/pages/a.ts",
      "src/lib/pages/b.ts",
      "docs/architecture/pages.md",
    ]);
  });

  it("parses positional args after --", () => {
    const files = parseModifiedFilesArgv(
      ["--", "./src/lib/canvas/reducer.ts"],
      {}
    );
    expect(files).toEqual(["src/lib/canvas/reducer.ts"]);
  });

  it("reads DOCS_CHECK_FILES from env", () => {
    const files = parseModifiedFilesArgv([], {
      DOCS_CHECK_FILES: "src/db/queries/a.ts, src/hooks/use-page-dispatch.ts",
    });
    expect(files).toEqual([
      "src/db/queries/a.ts",
      "src/hooks/use-page-dispatch.ts",
    ]);
  });
});

describe("resolveCheckScope", () => {
  const root = process.cwd();

  it("returns full mode when no paths are given", () => {
    expect(resolveCheckScope(root, [])).toMatchObject({ mode: "full" });
  });

  it("scopes manifest entries and docs for a pages path", () => {
    const scope = resolveCheckScope(root, ["src/lib/pages/page-icon.ts"]);
    expect(scope.mode).toBe("scoped");
    expect(scope.entries.length).toBeGreaterThan(0);
    expect(scope.docFiles).toContain("docs/architecture/pages.md");
  });

  it("includes edited markdown in ref scan without a code mapping", () => {
    const scope = resolveCheckScope(root, ["docs/README.md"]);
    expect(scope.mode).toBe("scoped");
    expect(scope.entries).toEqual([]);
    expect(scope.docFiles).toEqual(["docs/README.md"]);
  });
});

describe("normalizeModifiedPath", () => {
  it("strips leading ./ and normalizes slashes", () => {
    expect(normalizeModifiedPath(".\\docs\\README.md")).toBe("docs/README.md");
  });
});
