import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";

interface ResolveDocumentOrderIdsOptions {
  pendingOrder?: string[] | null;
  persistedOrder?: string[] | null;
  storageOrder: string[];
  workingOrder?: string[] | null;
}

function appendUniqueKnownIds(
  target: string[],
  source: string[] | null | undefined,
  knownIds: Set<string>
): void {
  if (!source?.length) {
    return;
  }

  const seen = new Set(target);
  for (const id of source) {
    if (!(knownIds.has(id) && !seen.has(id))) {
      continue;
    }

    target.push(id);
    seen.add(id);
  }
}

function completeKnownOrder(
  candidate: string[] | null | undefined,
  knownIds: Set<string>
): string[] | null {
  if (!candidate?.length) {
    return null;
  }

  const order: string[] = [];
  appendUniqueKnownIds(order, candidate, knownIds);
  return order.length === knownIds.size ? order : null;
}

export function resolveDocumentOrderIds({
  pendingOrder,
  persistedOrder,
  storageOrder,
  workingOrder,
}: ResolveDocumentOrderIdsOptions): string[] {
  const knownIds = new Set(storageOrder);

  for (const candidate of [pendingOrder, persistedOrder, workingOrder]) {
    const complete = completeKnownOrder(candidate, knownIds);
    if (complete) {
      return complete;
    }
  }

  const order: string[] = [];
  appendUniqueKnownIds(order, workingOrder, knownIds);
  appendUniqueKnownIds(order, persistedOrder, knownIds);
  appendUniqueKnownIds(order, storageOrder, knownIds);
  return order;
}

export function orderBlocksByIds(
  blocks: Block[],
  blockOrder: string[] | null | undefined
): Block[] {
  if (!blockOrder?.length) {
    return blocks;
  }

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ordered: Block[] = [];

  for (const id of blockOrder) {
    const block = byId.get(id);
    if (block) {
      ordered.push(block);
      byId.delete(id);
    }
  }

  for (const block of byId.values()) {
    ordered.push(block);
  }

  return ordered;
}

export function sortLocalBlocksByPageOrder(
  blocks: LocalBlock[],
  blockOrder: string[] | null | undefined
): LocalBlock[] {
  if (!blockOrder?.length) {
    return blocks;
  }

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ordered: LocalBlock[] = [];

  for (const id of blockOrder) {
    const block = byId.get(id);
    if (block) {
      ordered.push(block);
      byId.delete(id);
    }
  }

  for (const block of byId.values()) {
    ordered.push(block);
  }

  return ordered;
}
