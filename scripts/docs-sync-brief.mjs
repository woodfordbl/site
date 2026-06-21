import {
  normalizeModifiedPath,
  parseModifiedFilesArgv,
} from "./docs-check-scope.mjs";
import { readSession } from "./docs-hook-session.mjs";
import {
  filterManifestEntriesByPaths,
  getDocsForPath,
  loadManifest,
} from "./docs-manifest-lookup.mjs";

const GUIDELINES = "docs/contributing/new-documentation.md";

const STRUCTURAL_PREFIXES = [
  "src/lib/",
  "src/components/canvas/",
  "src/components/pages/",
  "src/components/blocks/",
  "src/db/",
  "src/hooks/",
];

const SKIP_PATH_PATTERN =
  /(?:\.test\.(?:ts|tsx)$|\/components\/ui\/|\/routes\/|\/types\/.*\/.*-(?:view|edit)\.tsx$)/;

/**
 * @param {string} path
 */
export function isStructuralCodePath(path) {
  if (SKIP_PATH_PATTERN.test(path)) {
    return false;
  }
  return STRUCTURAL_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * @param {string[]} paths
 */
export function partitionModifiedPaths(paths) {
  const codePaths = [];
  const docPaths = [];
  for (const path of paths) {
    if (path.endsWith(".md")) {
      docPaths.push(path);
    } else {
      codePaths.push(path);
    }
  }
  return { codePaths, docPaths };
}

/**
 * @param {string} root
 * @param {string[]} codePaths
 */
export function collectUnmappedStructuralPaths(root, codePaths) {
  const manifest = loadManifest(root);
  const unmapped = [];
  for (const path of codePaths) {
    if (!isStructuralCodePath(path)) {
      continue;
    }
    if (filterManifestEntriesByPaths(manifest, [path]).length === 0) {
      unmapped.push(path);
    }
  }
  return [...new Set(unmapped)].sort();
}

/**
 * @param {string} root
 * @param {string[]} codePaths
 */
export function collectMappedDocsForPaths(root, codePaths) {
  const docs = new Set();
  for (const path of codePaths) {
    for (const doc of getDocsForPath(root, path)) {
      docs.add(doc);
    }
  }
  return [...docs].sort();
}

/**
 * @param {string[]} unmappedPaths
 */
export function suggestHookGateMajorGlobs(unmappedPaths) {
  const suggestions = [];
  const areas = new Set();

  for (const path of unmappedPaths) {
    const segments = path.split("/");
    if (path.startsWith("src/lib/") && segments.length >= 3) {
      areas.add(`src/lib/${segments[2]}/`);
    }
  }

  for (const prefix of [...areas].sort()) {
    const area = prefix.split("/")[2];
    suggestions.push(
      `In docs/.doc-manifest.json, add a mapping with "majorGlobs": ["${prefix}commands.ts", "${prefix}reducer.ts", "${prefix}effects.ts", "src/hooks/use-${area}-dispatch.ts"] (adjust names to match the feature — command/reducer/dispatch files always bypass the line threshold).`
    );
  }

  return suggestions;
}

/**
 * @param {string[]} unmappedPaths
 */
export function suggestNewDocTargets(unmappedPaths) {
  if (unmappedPaths.length === 0) {
    return [];
  }

  const areas = new Set();
  for (const path of unmappedPaths) {
    const segments = path.split("/");
    if (path.startsWith("src/lib/") && segments.length >= 3) {
      areas.add(segments[2]);
    } else if (path.startsWith("src/components/") && segments.length >= 3) {
      areas.add(segments[2]);
    } else if (path.startsWith("src/db/")) {
      areas.add("db");
    } else if (path.startsWith("src/hooks/")) {
      areas.add("hooks");
    }
  }

  const suggestions = [];
  for (const area of [...areas].sort()) {
    if (area === "hooks") {
      suggestions.push(
        `Consider extending an existing architecture doc and adding hook globs to docs/.doc-manifest.json (see ${GUIDELINES}).`
      );
      continue;
    }
    suggestions.push(
      `Consider docs/architecture/${area}.md (+ docs/reference/${area}-commands.md if new commands) and a manifest row for src/lib/${area}/** or src/components/${area}/** — see ${GUIDELINES}.`
    );
  }
  return suggestions;
}

/**
 * @param {object} input
 */
function pushListSection(lines, heading, items) {
  if (!items?.length) {
    return;
  }
  lines.push(heading);
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function pushUnmappedSections(lines, input) {
  pushListSection(
    lines,
    "## Unmapped structural code (manifest + possibly NEW docs)",
    input.unmappedStructural
  );
  pushListSection(
    lines,
    "## Suggested net-new documentation",
    input.suggestions
  );
  if (input.hookGateSuggestions?.length > 0) {
    lines.push("## Hook gate (major paths — required for new features)");
    lines.push(
      "Add `majorGlobs` on the new manifest mapping (or `hookGate.majorBasenames` for a shared filename). Major paths always run docs hooks, even for 1-line edits."
    );
    for (const suggestion of input.hookGateSuggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }
  lines.push(
    "docs-sync: follow new-documentation.md — extend existing pages when possible; otherwise create architecture/reference files, update docs/.doc-manifest.json (globs, docs, majorGlobs) and docs/README.md."
  );
  lines.push("");
}

export function formatSyncBrief(input) {
  const lines = ["# Documentation sync brief", ""];

  lines.push("## Guidelines (read first)");
  lines.push(`- ${GUIDELINES}`);
  lines.push("- docs/contributing/updating-docs.md");
  lines.push("- docs/contributing/inline-api-docs.md");
  lines.push("");

  pushListSection(lines, "## Modified paths this session", input.modifiedPaths);
  pushListSection(
    lines,
    "## Mapped docs to update (minimum)",
    input.mappedDocs
  );
  pushListSection(lines, "## Edited markdown", input.editedDocs);

  if (input.unmappedStructural.length > 0) {
    pushUnmappedSections(lines, input);
  } else if (input.mappedDocs.length > 0) {
    lines.push(
      "docs-sync: update mapped architecture/reference behavior and JSDoc on changed exports; create new pages only if the diff introduces a capability not covered above."
    );
    lines.push("");
  }

  lines.push("## Verification");
  if (input.modifiedPaths.length > 0) {
    lines.push(`- pnpm docs:check --files ${input.modifiedPaths.join(",")}`);
  }
  lines.push("- pnpm docs:check (full, before merge)");

  return `${lines.join("\n")}\n`;
}

function main() {
  const root = process.cwd();
  const argv = process.argv.slice(2);
  const useSession = argv.includes("--session");
  const filteredArgv = argv.filter((arg) => arg !== "--session");
  const fromArgv = parseModifiedFilesArgv(filteredArgv).map(
    normalizeModifiedPath
  );

  let modifiedPaths = fromArgv;
  if (modifiedPaths.length === 0 && (useSession || filteredArgv.length === 0)) {
    modifiedPaths = readSession(root).paths.map(normalizeModifiedPath);
  }

  const { codePaths, docPaths } = partitionModifiedPaths(modifiedPaths);
  const mappedDocs = collectMappedDocsForPaths(root, codePaths);
  const unmappedStructural = collectUnmappedStructuralPaths(root, codePaths);
  const suggestions = suggestNewDocTargets(unmappedStructural);
  const hookGateSuggestions = suggestHookGateMajorGlobs(unmappedStructural);

  const brief = formatSyncBrief({
    modifiedPaths,
    mappedDocs,
    editedDocs: docPaths.sort(),
    unmappedStructural,
    suggestions,
    hookGateSuggestions,
  });

  process.stdout.write(brief);
}

const isMain = process.argv[1]?.includes("docs-sync-brief.mjs") ?? false;
if (isMain) {
  main();
}
