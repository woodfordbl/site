import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "node_modules/emojibase-data/en");
const targetDir = join(root, "public/emojibase/en");

const files = ["data.json", "messages.json"];

await mkdir(targetDir, { recursive: true });

for (const file of files) {
  await cp(join(sourceDir, file), join(targetDir, file));
}

console.log(
  `sync-emojibase: copied ${files.join(", ")} → public/emojibase/en/`
);
