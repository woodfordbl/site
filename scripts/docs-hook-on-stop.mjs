import { spawnSync } from "node:child_process";
import { evaluateDocsHookGate } from "./docs-hook-gate.mjs";
import { clearSession, readSession } from "./docs-hook-session.mjs";

const root = process.cwd();

function parseStopPayload(raw) {
  const payload = { status: "completed", loopCount: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.status === "string") {
      payload.status = parsed.status;
    }
    if (typeof parsed.loop_count === "number") {
      payload.loopCount = parsed.loop_count;
    }
  } catch {
    // use defaults
  }
  return payload;
}

function runScopedDocsCheck(paths) {
  if (paths.length === 0) {
    return { ok: true, output: "" };
  }

  const check = spawnSync("pnpm", ["docs:check", "--files", ...paths], {
    cwd: root,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });
  return {
    ok: check.status === 0,
    output: [check.stdout, check.stderr].filter(Boolean).join("\n").trim(),
  };
}

function buildBlockedMessage(checkOutput) {
  return [
    "Documentation sync is still blocked after a docs-sync pass.",
    "",
    checkOutput ? `pnpm docs:check output:\n${checkOutput}` : "",
    "",
    "Stop and report what is blocking docs:check to the user. Do not retry automatically.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSyncPrompt(session, check) {
  const brief = spawnSync(
    "node",
    ["scripts/docs-sync-brief.mjs", "--session"],
    {
      cwd: root,
      encoding: "utf-8",
      shell: process.platform === "win32",
    }
  );
  const briefText = [brief.stdout, brief.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  const lines = [
    "Structural code changes require documentation updates before this task is complete.",
    "",
    "Delegate to the **docs-sync** subagent now. Start with `pnpm docs:sync-brief` (brief below). Do not mark the task complete until full `pnpm docs:check` passes.",
    "",
    "docs-sync must create net-new architecture/reference pages when the brief lists unmapped structural code — follow docs/contributing/new-documentation.md (manifest + majorGlobs hook gate + README + cross-links).",
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
  if (!check.ok && check.output) {
    lines.push("", "pnpm docs:check output:", check.output);
  }
  if (briefText) {
    lines.push("", "---", "", briefText);
  }

  return lines.join("\n");
}

function exitSilently() {
  process.stdout.write("{}\n");
  process.exit(0);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const { status, loopCount } = parseStopPayload(input);

  if (status !== "completed") {
    exitSilently();
    return;
  }

  const session = readSession(root);
  const gate = evaluateDocsHookGate(root, session.paths);

  if (!gate.shouldRun) {
    clearSession(root);
    exitSilently();
    return;
  }

  const check = runScopedDocsCheck(session.paths);

  if (check.ok) {
    clearSession(root);
    exitSilently();
    return;
  }

  if (loopCount >= 1) {
    process.stdout.write(
      `${JSON.stringify({ followup_message: buildBlockedMessage(check.output) })}\n`
    );
    process.exit(0);
  }

  process.stdout.write(
    `${JSON.stringify({ followup_message: buildSyncPrompt(session, check) })}\n`
  );
  process.exit(0);
});
