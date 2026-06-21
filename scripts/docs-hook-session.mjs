import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDocsForPath } from "./docs-manifest-lookup.mjs";

export const SESSION_REL = ".cursor/hooks-state/docs-session.json";

export function sessionPath(root) {
  return join(root, SESSION_REL);
}

export function readSession(root) {
  const path = sessionPath(root);
  if (!existsSync(path)) {
    return { paths: [], docs: [] };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return {
      paths: Array.isArray(data.paths) ? data.paths : [],
      docs: Array.isArray(data.docs) ? data.docs : [],
    };
  } catch {
    return { paths: [], docs: [] };
  }
}

export function writeSession(root, session) {
  const path = sessionPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
}

export function clearSession(root) {
  writeSession(root, { paths: [], docs: [] });
}

/**
 * @param {string} relativePath
 */
function isTrackedDocPath(relativePath) {
  return (
    relativePath === "AGENTS.md" ||
    (relativePath.startsWith("docs/") && relativePath.endsWith(".md"))
  );
}

/**
 * @param {string} root
 * @param {string} relativePath
 */
export function trackPath(root, relativePath) {
  const session = readSession(root);

  if (isTrackedDocPath(relativePath)) {
    if (!session.paths.includes(relativePath)) {
      session.paths.push(relativePath);
    }
    session.paths.sort();
    writeSession(root, session);
    return;
  }

  const docs = getDocsForPath(root, relativePath);
  if (docs.length === 0) {
    return;
  }
  if (!session.paths.includes(relativePath)) {
    session.paths.push(relativePath);
  }
  for (const doc of docs) {
    if (!session.docs.includes(doc)) {
      session.docs.push(doc);
    }
  }
  session.paths.sort();
  session.docs.sort();
  writeSession(root, session);
}

export function toRepoRelative(root, filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const rootSlash = root.replaceAll("\\", "/");
  if (normalized.startsWith(`${rootSlash}/`)) {
    return normalized.slice(rootSlash.length + 1);
  }
  return normalized;
}
