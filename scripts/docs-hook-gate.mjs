import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadManifest,
  relativePathMatchesGlob,
} from "./docs-manifest-lookup.mjs";

/** Total added+deleted lines across session paths required to run docs hooks (override with DOCS_HOOK_MIN_LINES). */
export const DEFAULT_MIN_CHANGED_LINES = 10;

/**
 * @param {string} root
 */
export function loadHookGateConfig(root) {
  const manifest = loadManifest(root);
  const gate = manifest.hookGate ?? {};
  const majorExactPaths = new Set(
    (gate.majorExactPaths ?? []).map((p) => p.replaceAll("\\", "/"))
  );
  const majorBasenames = new Set(gate.majorBasenames ?? []);
  const mappingMajorGlobs = [];

  for (const entry of manifest.mappings ?? []) {
    if (Array.isArray(entry.majorGlobs)) {
      mappingMajorGlobs.push(...entry.majorGlobs);
    }
  }

  return { majorExactPaths, majorBasenames, mappingMajorGlobs };
}

/**
 * @param {string} root
 * @param {string} relativePath
 */
export function isMajorStructuralPath(root, relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const { majorExactPaths, majorBasenames, mappingMajorGlobs } =
    loadHookGateConfig(root);

  if (majorExactPaths.has(normalized)) {
    return true;
  }

  const base = normalized.split("/").pop() ?? "";
  if (majorBasenames.has(base)) {
    return true;
  }

  for (const glob of mappingMajorGlobs) {
    if (relativePathMatchesGlob(normalized, glob)) {
      return true;
    }
  }

  return false;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function minChangedLinesThreshold(env = process.env) {
  const raw = env.DOCS_HOOK_MIN_LINES;
  if (raw === undefined || raw === "") {
    return DEFAULT_MIN_CHANGED_LINES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_MIN_CHANGED_LINES;
}

/**
 * @param {string} output
 */
function parseNumstat(output) {
  /** @type {Map<string, { additions: number, deletions: number }>} */
  const perFile = new Map();
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const [add, del, ...rest] = line.split("\t");
    if (rest.length === 0) {
      continue;
    }
    const file = rest.join("\t").replaceAll("\\", "/");
    const additions = add === "-" ? 0 : Number.parseInt(add, 10) || 0;
    const deletions = del === "-" ? 0 : Number.parseInt(del, 10) || 0;
    const prev = perFile.get(file) ?? { additions: 0, deletions: 0 };
    perFile.set(file, {
      additions: prev.additions + additions,
      deletions: prev.deletions + deletions,
    });
  }
  return perFile;
}

/**
 * @param {string} root
 * @param {string} relativePath
 */
function countUntrackedLines(root, relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) {
    return { additions: 0, deletions: 0 };
  }
  const lines = readFileSync(full, "utf-8").split("\n").length;
  return { additions: lines, deletions: 0 };
}

/**
 * @param {string} root
 * @param {string[]} relativePaths
 */
export function countChangedLinesForPaths(root, relativePaths) {
  const normalized = [
    ...new Set(relativePaths.map((p) => p.replaceAll("\\", "/"))),
  ];
  if (normalized.length === 0) {
    return {
      additions: 0,
      deletions: 0,
      total: 0,
      perFile: {},
      untracked: [],
    };
  }

  const unstaged = spawnSync(
    "git",
    ["diff", "--numstat", "--", ...normalized],
    { cwd: root, encoding: "utf-8" }
  );
  const staged = spawnSync(
    "git",
    ["diff", "--cached", "--numstat", "--", ...normalized],
    { cwd: root, encoding: "utf-8" }
  );

  const perFile = parseNumstat(
    [unstaged.stdout, staged.stdout].filter(Boolean).join("\n")
  );

  const untracked = [];
  for (const path of normalized) {
    if (perFile.has(path)) {
      continue;
    }
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", path], {
      cwd: root,
      encoding: "utf-8",
    });
    if (tracked.status !== 0) {
      const counts = countUntrackedLines(root, path);
      perFile.set(path, counts);
      untracked.push(path);
    }
  }

  let additions = 0;
  let deletions = 0;
  /** @type {Record<string, { additions: number, deletions: number, total: number }>} */
  const perFileRecord = {};
  for (const [file, counts] of perFile) {
    additions += counts.additions;
    deletions += counts.deletions;
    perFileRecord[file] = {
      ...counts,
      total: counts.additions + counts.deletions,
    };
  }

  return {
    additions,
    deletions,
    total: additions + deletions,
    perFile: perFileRecord,
    untracked,
  };
}

/**
 * @param {string} root
 * @param {string[]} sessionPaths
 * @param {NodeJS.ProcessEnv} [env]
 */
export function evaluateDocsHookGate(root, sessionPaths, env = process.env) {
  const paths = sessionPaths.map((p) => p.replaceAll("\\", "/"));
  const threshold = minChangedLinesThreshold(env);
  const majorPaths = paths.filter((path) => isMajorStructuralPath(root, path));
  const lineStats = countChangedLinesForPaths(root, paths);

  if (paths.length === 0) {
    return {
      shouldRun: false,
      reason: "no_session_paths",
      threshold,
      lineStats,
      majorPaths,
    };
  }

  if (majorPaths.length > 0) {
    return {
      shouldRun: true,
      reason: "major_path",
      threshold,
      lineStats,
      majorPaths,
    };
  }

  if (lineStats.total >= threshold) {
    return {
      shouldRun: true,
      reason: "line_threshold",
      threshold,
      lineStats,
      majorPaths,
    };
  }

  return {
    shouldRun: false,
    reason: "below_line_threshold",
    threshold,
    lineStats,
    majorPaths,
  };
}
