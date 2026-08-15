/**
 * @fileoverview File-length ratchet: source files may not exceed MAX_LINES.
 * Files already over the cap when the ratchet was introduced are recorded in
 * scripts/file-length-baseline.json at their then-current length and may only
 * shrink; anything else failing the cap fails the check. Run with --update
 * after legitimately shrinking a grandfathered file to tighten its baseline.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const MAX_LINES = 600;
const BASELINE_PATH = new URL("./file-length-baseline.json", import.meta.url)
  .pathname;
const update = process.argv.includes("--update");

const tracked = execFileSync(
  "git",
  ["ls-files", "src", "routes", "scripts", "--", "*.ts", "*.tsx", "*.mjs"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter((file) => !file.endsWith(".gen.ts"));

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  baseline = {};
}

const next = {};
const failures = [];
for (const file of tracked) {
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines <= MAX_LINES) {
    continue;
  }
  const allowed = baseline[file];
  if (allowed === undefined) {
    failures.push(`${file}: ${lines} lines (max ${MAX_LINES}, not grandfathered)`);
  } else if (lines > allowed) {
    failures.push(`${file}: ${lines} lines (grandfathered at ${allowed} — may only shrink)`);
  }
  next[file] = Math.min(lines, allowed ?? lines);
}

if (update || Object.keys(baseline).length === 0) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`baseline written: ${Object.keys(next).length} grandfathered files`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error("File-length ratchet failures:");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
console.log("file lengths ok");
