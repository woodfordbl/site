import { toRepoRelative, trackPath } from "./docs-hook-session.mjs";

const root = process.cwd();
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const filePath = payload.file_path;
    if (typeof filePath === "string" && filePath.length > 0) {
      trackPath(root, toRepoRelative(root, filePath));
    }
  } catch {
    // ignore malformed hook input
  }
  process.exit(0);
});
