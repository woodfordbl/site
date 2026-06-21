import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  formatScopeSummary,
  parseModifiedFilesArgv,
  resolveCheckScope,
} from "./docs-check-scope.mjs";
import { latestCodeMtime, loadManifest } from "./docs-manifest-lookup.mjs";
import { collectBrokenDocReferences } from "./docs-ref-check.mjs";

const root = process.cwd();
const manifest = loadManifest(root);

function collectStaleDocs(entry) {
  const stale = [];
  const codeMtime = latestCodeMtime(root, entry.globs);

  for (const doc of entry.docs) {
    const docPath = join(root, doc);
    if (!existsSync(docPath)) {
      stale.push({ doc, missing: true });
      continue;
    }
    const docMtime = statSync(docPath).mtimeMs;
    if (codeMtime > docMtime + 1000) {
      stale.push({ doc, codeMtime, docMtime });
    }
  }

  return stale;
}

function main() {
  const modifiedPaths = parseModifiedFilesArgv(process.argv.slice(2));
  const scope = resolveCheckScope(root, modifiedPaths);
  const entries =
    scope.mode === "full" ? manifest.mappings : (scope.entries ?? []);
  const stale = entries.flatMap(collectStaleDocs);
  let brokenRefs = [];
  if (scope.mode === "full") {
    brokenRefs = collectBrokenDocReferences(root);
  } else if (scope.docFiles?.length) {
    brokenRefs = collectBrokenDocReferences(root, { docFiles: scope.docFiles });
  }
  let failed = false;

  if (stale.length > 0) {
    failed = true;
    console.error("docs:check FAILED — update these docs:");
    for (const item of stale) {
      console.error(`  - ${item.doc}${item.missing ? " (missing)" : ""}`);
    }
  }

  if (brokenRefs.length > 0) {
    failed = true;
    console.error("docs:check FAILED — broken file references:");
    for (const item of brokenRefs) {
      console.error(
        `  - ${item.doc}:${item.line} (${item.kind}) ${item.rawRef} -> ${item.resolved}`
      );
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`docs:check OK${formatScopeSummary(scope)}`);
  process.exit(0);
}

main();
