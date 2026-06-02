import { spawnSync } from "node:child_process";
import { clearSession, readSession } from "./docs-hook-session.mjs";

const root = process.cwd();

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let status = "completed";
  let loopCount = 0;
  try {
    const payload = JSON.parse(input);
    if (typeof payload.status === "string") {
      status = payload.status;
    }
    if (typeof payload.loop_count === "number") {
      loopCount = payload.loop_count;
    }
  } catch {
    // use defaults
  }

  if (status !== "completed") {
    process.stdout.write("{}\n");
    process.exit(0);
  }

  const session = readSession(root);
  const check = spawnSync("pnpm", ["docs:check"], {
    cwd: root,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  const checkOk = check.status === 0;
  const checkOutput = [check.stdout, check.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  const hasStructural = session.paths.length > 0;

  if (checkOk && !hasStructural) {
    clearSession(root);
    process.stdout.write("{}\n");
    process.exit(0);
  }

  if (checkOk && hasStructural) {
    clearSession(root);
    process.stdout.write("{}\n");
    process.exit(0);
  }

  if (loopCount >= 1 && !checkOk) {
    const msg = [
      "Documentation sync is still blocked after a docs-sync pass.",
      "",
      checkOutput ? `pnpm docs:check output:\n${checkOutput}` : "",
      "",
      "Stop and report what is blocking docs:check to the user. Do not retry automatically.",
    ]
      .filter(Boolean)
      .join("\n");
    process.stdout.write(`${JSON.stringify({ followup_message: msg })}\n`);
    process.exit(0);
  }

  const lines = [
    "Structural code changes require documentation updates before this task is complete.",
    "",
    "Delegate to the **docs-sync** subagent now. Do not mark the task complete until `pnpm docs:check` passes.",
    "",
    "References:",
    "- docs/contributing/updating-docs.md — checklist",
    "- docs/contributing/inline-api-docs.md — colocated JSDoc on changed exports",
    "- docs/.doc-manifest.json — glob → doc map",
    "- docs/README.md — index",
  ];

  if (session.paths.length > 0) {
    lines.push("", "Touched structural paths this session:");
    for (const p of session.paths) {
      lines.push(`- ${p}`);
    }
  }
  if (session.docs.length > 0) {
    lines.push("", "Update these docs (minimum):");
    for (const d of session.docs) {
      lines.push(`- ${d}`);
    }
  }
  if (!checkOk && checkOutput) {
    lines.push("", "pnpm docs:check output:", checkOutput);
  }

  lines.push(
    "",
    "docs-sync must: (1) git diff for changed exports, (2) update architecture/reference markdown, (3) refresh JSDoc on changed exports per inline-api-docs.md, (4) run pnpm docs:check until green."
  );

  process.stdout.write(
    `${JSON.stringify({ followup_message: lines.join("\n") })}\n`
  );
  process.exit(0);
});
