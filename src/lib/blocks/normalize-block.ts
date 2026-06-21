import {
  createEmptyBlock,
  getTextFromBlock,
} from "@/lib/blocks/create-block.ts";
import {
  defaultChildTypeForContainer,
  isAllowedChild,
  isContainerType,
} from "@/lib/canvas/block-container-config.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { blockSchema } from "@/lib/schemas/block.ts";

interface LegacyBulletListBlock {
  id: string;
  indent?: number;
  parentId?: string | null;
  props?: {
    children?: Array<{ text?: string }>;
  };
  type: "bulletList";
}

function migrateBulletList(raw: LegacyBulletListBlock): Block {
  const firstText = raw.props?.children?.[0]?.text ?? "";
  return {
    id: raw.id,
    type: "text",
    indent: raw.indent,
    parentId: raw.parentId ?? null,
    props: { text: firstText },
  };
}

/** Coerce persisted or legacy JSON into the current block model. */
export function normalizeBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as { type?: string };
  if (candidate.type === "bulletList") {
    return migrateBulletList(raw as LegacyBulletListBlock);
  }

  const parsed = blockSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Re-type a block so the given container accepts it, preserving text. */
export function coerceContainerChildBlock(
  block: Block,
  containerType: Block["type"]
): Block {
  if (containerType === "columns" && block.type !== "column") {
    return {
      id: block.id,
      type: "column",
      parentId: block.parentId ?? null,
      indent: block.indent,
      props: {},
    };
  }

  if (containerType === "table" && block.type !== "tableRow") {
    return {
      id: block.id,
      type: "tableRow",
      parentId: block.parentId ?? null,
      indent: block.indent,
      props: {},
    };
  }

  if (containerType === "tableRow" && block.type !== "tableCell") {
    return {
      id: block.id,
      type: "tableCell",
      parentId: block.parentId ?? null,
      indent: block.indent,
      props: { text: getTextFromBlock(block) },
    };
  }

  const defaultChildType = defaultChildTypeForContainer(containerType);

  if (defaultChildType === "checklistItem") {
    return {
      id: block.id,
      type: "checklistItem",
      parentId: block.parentId ?? null,
      indent: block.indent,
      props: { text: getTextFromBlock(block), checked: false },
    };
  }

  if (defaultChildType !== "text") {
    return block;
  }

  return {
    id: block.id,
    type: "text",
    parentId: block.parentId ?? null,
    indent: block.indent,
    props: { text: getTextFromBlock(block) },
  };
}

/** Each `column` block keeps at least one child (empty `text` row). */
export function ensureColumnMinimumChildren(blocks: Block[]): Block[] {
  const columnIds = blocks
    .filter((block) => block.type === "column")
    .map((block) => block.id);

  if (columnIds.length === 0) {
    return blocks;
  }

  const next = [...blocks];
  let changed = false;

  for (const columnId of columnIds) {
    const hasChild = next.some(
      (block) => (block.parentId ?? null) === columnId
    );
    if (!hasChild) {
      const text = createEmptyBlock("text");
      text.parentId = columnId;
      next.push(text);
      changed = true;
    }
  }

  return changed ? next : blocks;
}

const MIN_TABLE_COLUMNS = 2;

/** Pad ragged table rows and sync `columnWidths` length with cell count. */
export function ensureTableMinimumGrid(blocks: Block[]): Block[] {
  const tableBlocks = blocks.filter((block) => block.type === "table");
  if (tableBlocks.length === 0) {
    return blocks;
  }

  let next = [...blocks];
  let changed = false;

  for (const tableBlock of tableBlocks) {
    if (tableBlock.type !== "table") {
      continue;
    }

    let rowBlocks = next.filter(
      (block) =>
        block.type === "tableRow" && (block.parentId ?? null) === tableBlock.id
    );

    if (rowBlocks.length === 0) {
      const row = createEmptyBlock("tableRow");
      row.parentId = tableBlock.id;
      next.push(row);
      rowBlocks = [row];
      changed = true;
    }

    const columnCount = Math.max(
      tableBlock.props.columnWidths.length,
      MIN_TABLE_COLUMNS,
      ...rowBlocks.map(
        (row) =>
          next.filter(
            (block) =>
              block.type === "tableCell" && (block.parentId ?? null) === row.id
          ).length
      )
    );

    const mergedWidths = [...tableBlock.props.columnWidths];
    while (mergedWidths.length < columnCount) {
      mergedWidths.push(1);
    }
    mergedWidths.length = columnCount;

    if (
      mergedWidths.length !== tableBlock.props.columnWidths.length ||
      mergedWidths.some((w, i) => w !== tableBlock.props.columnWidths[i])
    ) {
      next = next.map((block) =>
        block.id === tableBlock.id && block.type === "table"
          ? { ...block, props: { ...block.props, columnWidths: mergedWidths } }
          : block
      );
      changed = true;
    }

    for (const rowBlock of rowBlocks) {
      let cellCount = next.filter(
        (block) =>
          block.type === "tableCell" && (block.parentId ?? null) === rowBlock.id
      ).length;
      while (cellCount < columnCount) {
        const cell = createEmptyBlock("tableCell");
        cell.parentId = rowBlock.id;
        next.push(cell);
        cellCount += 1;
        changed = true;
      }
    }
  }

  return changed ? next : blocks;
}

/** Container children are validated against container policy when reading persisted blocks. */
export function coerceContainerChildBlocks(blocks: Block[]): Block[] {
  const containerTypesById = new Map(
    blocks
      .filter((block) => isContainerType(block.type))
      .map((block) => [block.id, block.type])
  );

  if (containerTypesById.size === 0) {
    return blocks;
  }

  return blocks.map((block) => {
    const parentId = block.parentId ?? null;
    const containerType = parentId
      ? containerTypesById.get(parentId)
      : undefined;
    if (!containerType || isAllowedChild(containerType, block.type)) {
      return block;
    }

    return coerceContainerChildBlock(block, containerType);
  });
}
