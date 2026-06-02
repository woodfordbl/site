import type { Block } from "@/lib/schemas/block.ts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash, 33) + input.charCodeAt(index);
    hash %= 2_147_483_647;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function hashBlock(block: Block): string {
  return hashString(stableStringify(block));
}

export function hashPageBlocks(blocks: Block[]): string {
  return hashString(stableStringify(blocks));
}
