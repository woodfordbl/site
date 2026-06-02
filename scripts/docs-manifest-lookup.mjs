import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative } from "node:path";

const SOURCE_FILE_PATTERN = /\.(ts|tsx|mjs)$/;
const GLOB_RECURSIVE_SUFFIX = /\*\*$/;
const GLOB_SINGLE_SUFFIX = /\*$/;

export function loadManifest(root) {
  return JSON.parse(
    readFileSync(join(root, "docs/.doc-manifest.json"), "utf-8")
  );
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    if (entry.isDirectory()) {
      walkFiles(full, acc);
    } else if (SOURCE_FILE_PATTERN.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

export function expandGlob(root, pattern) {
  const base = pattern
    .replace(GLOB_RECURSIVE_SUFFIX, "")
    .replace(GLOB_SINGLE_SUFFIX, "");
  const abs = join(root, base);
  if (pattern.endsWith("/**")) {
    return walkFiles(abs);
  }
  if (existsSync(abs)) {
    return [abs];
  }
  return [];
}

function escapeRegex(text) {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globPatternToRegExp(globPattern) {
  if (globPattern.endsWith("/**")) {
    const prefix = globPattern.slice(0, -3);
    return new RegExp(`^${escapeRegex(prefix)}(?:/.*)?$`);
  }

  let re = "";
  for (let i = 0; i < globPattern.length; i++) {
    const ch = globPattern[i];
    if (ch === "*") {
      re += "[^/]*";
      continue;
    }
    re += escapeRegex(ch);
  }
  return new RegExp(`^${re}$`);
}

function pathMatchesGlob(relativePath, globPattern) {
  const normalized = normalize(relativePath).replaceAll("\\", "/");
  return globPatternToRegExp(globPattern).test(normalized);
}

/**
 * @param {string} root - repo root
 * @param {string} relativePath - path relative to root (e.g. src/lib/canvas/reducer.ts)
 */
export function getDocsForPath(root, relativePath) {
  const manifest = loadManifest(root);
  const docs = new Set();
  for (const entry of manifest.mappings) {
    for (const glob of entry.globs) {
      if (pathMatchesGlob(relativePath, glob)) {
        for (const doc of entry.docs) {
          docs.add(doc);
        }
      }
    }
  }
  return [...docs].sort();
}

/**
 * @param {string} root
 * @param {string} relativePath
 */
export function isMappedStructuralPath(root, relativePath) {
  return getDocsForPath(root, relativePath).length > 0;
}

export function latestCodeMtime(root, globs) {
  let codeMtime = 0;
  for (const globPattern of globs) {
    for (const file of expandGlob(root, globPattern)) {
      const mtime = statSync(file).mtimeMs;
      if (mtime > codeMtime) {
        codeMtime = mtime;
      }
    }
  }
  return codeMtime;
}

function cli() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  let pathArg = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path" && args[i + 1]) {
      pathArg = args[i + 1];
      break;
    }
  }
  if (!pathArg) {
    console.error(
      "Usage: node scripts/docs-manifest-lookup.mjs --path <relative-path>"
    );
    process.exit(1);
  }
  const docs = getDocsForPath(root, pathArg);
  console.log(
    JSON.stringify({
      path: pathArg,
      mapped: docs.length > 0,
      docs,
    })
  );
}

const isMain = process.argv[1]?.includes("docs-manifest-lookup.mjs") ?? false;
if (isMain) {
  cli();
}
