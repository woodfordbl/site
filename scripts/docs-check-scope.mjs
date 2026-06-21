import {
  filterManifestEntriesByPaths,
  loadManifest,
} from "./docs-manifest-lookup.mjs";

/**
 * @param {string} path
 */
export function normalizeModifiedPath(path) {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * @param {string[]} files
 * @param {string} value
 */
function pushCommaSeparatedPaths(files, value) {
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed) {
      files.push(normalizeModifiedPath(trimmed));
    }
  }
}

/**
 * Consumes values after a `--files` flag; returns the next argv index.
 * @param {string[]} files
 * @param {string[]} argv
 * @param {number} start
 */
function consumeFilesFlag(files, argv, start) {
  let index = start;
  while (index < argv.length && !argv[index].startsWith("-")) {
    pushCommaSeparatedPaths(files, argv[index]);
    index += 1;
  }
  return index;
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
export function parseModifiedFilesArgv(argv, env = process.env) {
  const files = [];
  const envFiles = env.DOCS_CHECK_FILES;
  if (typeof envFiles === "string" && envFiles.length > 0) {
    pushCommaSeparatedPaths(files, envFiles);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--files") {
      index = consumeFilesFlag(files, argv, index + 1) - 1;
      continue;
    }
    if (arg === "--") {
      for (let rest = index + 1; rest < argv.length; rest += 1) {
        files.push(normalizeModifiedPath(argv[rest]));
      }
      break;
    }
    if (!arg.startsWith("-")) {
      files.push(normalizeModifiedPath(arg));
    }
  }

  return [...new Set(files)];
}

/**
 * @param {string} path
 */
function isDocPath(path) {
  return (
    path === "AGENTS.md" || (path.startsWith("docs/") && path.endsWith(".md"))
  );
}

/**
 * @param {string} root
 * @param {string[]} modifiedPaths
 */
export function resolveCheckScope(root, modifiedPaths) {
  if (!modifiedPaths?.length) {
    return {
      mode: "full",
      entries: null,
      docFiles: null,
      modifiedPaths: [],
    };
  }

  const manifest = loadManifest(root);
  const entries = filterManifestEntriesByPaths(manifest, modifiedPaths);
  const docFiles = new Set();

  for (const entry of entries) {
    for (const doc of entry.docs) {
      docFiles.add(doc);
    }
  }
  for (const path of modifiedPaths) {
    if (isDocPath(path)) {
      docFiles.add(path);
    }
  }

  return {
    mode: "scoped",
    entries,
    docFiles: [...docFiles].sort(),
    modifiedPaths,
  };
}

export function formatScopeSummary(scope) {
  if (scope.mode !== "scoped") {
    return "";
  }
  return ` (scoped: ${scope.entries.length} mappings, ${scope.docFiles.length} docs, ${scope.modifiedPaths.length} paths)`;
}
