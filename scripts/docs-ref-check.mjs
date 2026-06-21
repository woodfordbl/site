import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;
const INLINE_CODE_PATTERN = /`([^`]+)`/g;
const REPO_ROOT_PREFIX = /^(?:@\/|(src|content|docs|scripts)\/)/;
const GLOB_CHARS = /[*?[\]{}]/;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|mjs|md|json|css)$/;

export function collectMarkdownDocFiles(root) {
  const files = [];

  function walk(dir) {
    if (!existsSync(dir)) {
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        files.push(full);
      }
    }
  }

  walk(join(root, "docs"));

  const agentsPath = join(root, "AGENTS.md");
  if (existsSync(agentsPath)) {
    files.push(agentsPath);
  }

  return files;
}

function walkRepoFiles(dir, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    if (entry.isDirectory()) {
      walkRepoFiles(full, acc);
    } else if (SOURCE_FILE_PATTERN.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function globToRegExp(glob) {
  let re = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          re += "(?:.*/)?";
          index += 2;
        } else {
          re += ".*";
          index += 1;
        }
      } else {
        re += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      re += "[^/]";
      continue;
    }
    if (".\\+^$|()[]{}".includes(char)) {
      re += `\\${char}`;
      continue;
    }
    re += char;
  }
  return new RegExp(`${re}$`);
}

function globHasMatches(root, pattern) {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const regex = globToRegExp(normalizedPattern);
  const starIndex = normalizedPattern.indexOf("*");
  const prefix =
    starIndex === -1
      ? normalizedPattern
      : normalizedPattern.slice(0, starIndex).replace(/\/$/, "");
  const searchRoot = prefix ? join(root, prefix) : root;

  if (starIndex === -1) {
    return existsSync(searchRoot);
  }

  if (!existsSync(searchRoot)) {
    return false;
  }

  const stat = statSync(searchRoot);
  if (!stat.isDirectory()) {
    return regex.test(relative(root, searchRoot).replace(/\\/g, "/"));
  }

  for (const file of walkRepoFiles(searchRoot)) {
    const repoRelative = relative(root, file).replace(/\\/g, "/");
    if (regex.test(repoRelative)) {
      return true;
    }
  }

  return false;
}

function stripQueryAndFragment(ref) {
  const hashIndex = ref.indexOf("#");
  const withoutHash = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
}

function resolveReference(ref, fromDocPath, root) {
  const clean = stripQueryAndFragment(ref.trim());
  if (!clean || clean.startsWith("#")) {
    return null;
  }

  if (clean.startsWith("@/")) {
    return normalize(join(root, "src", clean.slice(2)));
  }

  if (
    clean.startsWith("src/") ||
    clean.startsWith("content/") ||
    clean.startsWith("docs/") ||
    clean.startsWith("scripts/")
  ) {
    return normalize(join(root, clean));
  }

  return normalize(join(dirname(fromDocPath), clean));
}

function isExternalUrl(ref) {
  return /^(?:https?:|mailto:|tel:|\/\/)/.test(ref);
}

function isSkippableInlineCode(text) {
  if (text.includes("{") || text.includes("}")) {
    return true;
  }
  if (/\s/.test(text)) {
    return true;
  }
  if (text.startsWith("pnpm ") || text.includes(":check")) {
    return true;
  }
  if (text.includes("import.meta")) {
    return true;
  }
  return false;
}

function looksLikeRepoPath(text) {
  const clean = stripQueryAndFragment(text);
  if (!clean) {
    return false;
  }
  if (GLOB_CHARS.test(clean)) {
    const prefix = clean.split("*")[0].replace(/\/$/, "");
    return REPO_ROOT_PREFIX.test(prefix);
  }
  return REPO_ROOT_PREFIX.test(clean);
}

function referenceExists(root, refPath) {
  const repoRelative = relative(root, refPath).replace(/\\/g, "/");

  if (GLOB_CHARS.test(repoRelative)) {
    return globHasMatches(root, repoRelative);
  }

  if (!existsSync(refPath)) {
    return false;
  }

  if (repoRelative.endsWith("/")) {
    return statSync(refPath).isDirectory();
  }

  return true;
}

function recordReference(issues, docPath, line, kind, rawRef, root) {
  const resolved = resolveReference(rawRef, docPath, root);
  if (!resolved) {
    return;
  }

  if (!referenceExists(root, resolved)) {
    issues.push({
      doc: relative(root, docPath).replace(/\\/g, "/"),
      line,
      kind,
      rawRef,
      resolved: relative(root, resolved).replace(/\\/g, "/"),
    });
  }
}

function scanLine(line, docPath, lineNumber, issues, root) {
  for (const match of line.matchAll(MARKDOWN_LINK_PATTERN)) {
    const href = match[2];
    if (isExternalUrl(href)) {
      continue;
    }
    recordReference(issues, docPath, lineNumber, "link", href, root);
  }

  for (const match of line.matchAll(INLINE_CODE_PATTERN)) {
    const code = match[1];
    if (isSkippableInlineCode(code) || !looksLikeRepoPath(code)) {
      continue;
    }
    recordReference(issues, docPath, lineNumber, "code", code, root);
  }
}

/**
 * @param {string} root
 * @param {{ docFiles?: string[] }} [options] — repo-relative paths; when set, only those docs are scanned
 */
export function collectBrokenDocReferences(root, options = {}) {
  const issues = [];
  const docPaths =
    options.docFiles?.length > 0
      ? options.docFiles.map((doc) => join(root, doc))
      : collectMarkdownDocFiles(root);

  for (const docPath of docPaths) {
    const content = readFileSync(docPath, "utf-8");
    const lines = content.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      scanLine(lines[index], docPath, index + 1, issues, root);
    }
  }

  return issues;
}
