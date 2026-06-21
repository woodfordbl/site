import { IconListNumbers } from "@tabler/icons-react";
import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import {
  canInsertSiblingInContainer,
  isAllowedChild,
  shouldLiftDisallowedChildConversion,
  shouldLiftEmptyChildOnDelete,
  shouldLiftEmptyChildOnEnter,
} from "@/lib/canvas/block-container-config.ts";
import {
  filterSlashMenuItems,
  getBlockSpec,
  getSlashMenuItems,
} from "./registry.ts";

describe("getSlashMenuItems", () => {
  it("includes bullet and numbered list entries", () => {
    const items = getSlashMenuItems();
    const bullet = items.find((item) => item.key === "list-bullet");
    const ordered = items.find((item) => item.key === "list-ordered");

    expect(bullet).toMatchObject({
      id: "list",
      listVariant: "bullet",
      label: "Bullet list",
    });
    expect(ordered).toMatchObject({
      id: "list",
      listVariant: "ordered",
      label: "Numbered list",
    });
  });

  it("filters numbered list by ol query", () => {
    const items = filterSlashMenuItems("ol");

    expect(items.some((item) => item.key === "list-ordered")).toBe(true);
    expect(items.some((item) => item.key === "list-bullet")).toBe(false);
  });

  it("includes divider in slash menu", () => {
    const items = filterSlashMenuItems("divider");

    expect(items.some((item) => item.id === "divider")).toBe(true);
  });

  it("includes callout in slash menu", () => {
    const items = filterSlashMenuItems("callout");

    expect(items.some((item) => item.id === "callout")).toBe(true);
  });

  it("includes checklist in slash menu", () => {
    const items = filterSlashMenuItems("checklist");

    expect(items.some((item) => item.id === "checklist")).toBe(true);
  });

  it("includes column count entries for columns query", () => {
    const items = filterSlashMenuItems("columns");

    expect(items.filter((item) => item.id === "columns")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "columns-2", columnCount: 2 }),
        expect.objectContaining({ key: "columns-3", columnCount: 3 }),
        expect.objectContaining({ key: "columns-4", columnCount: 4 }),
      ])
    );
  });

  it("matches column slash aliases", () => {
    const items = filterSlashMenuItems("cols3");

    expect(items.some((item) => item.key === "columns-3")).toBe(true);
  });
});

describe("container block specs", () => {
  it("exposes list behavior through container policy", () => {
    const spec = getBlockSpec("list");

    expect(spec.container).toMatchObject({
      allowedChildTypes: ["text"],
      defaultChildType: "text",
      insertSiblingOnEnter: true,
    });
    expect(isAllowedChild("list", "text")).toBe(true);
    expect(isAllowedChild("list", "heading")).toBe(false);
    expect(canInsertSiblingInContainer("list")).toBe(true);
    expect(shouldLiftEmptyChildOnEnter("list")).toBe(true);
    expect(shouldLiftEmptyChildOnDelete("list")).toBe(true);
    expect(shouldLiftDisallowedChildConversion("list")).toBe(true);
  });

  it("exposes checklist behavior through container policy", () => {
    const spec = getBlockSpec("checklist");

    expect(spec.container).toMatchObject({
      allowedChildTypes: ["checklistItem"],
      defaultChildType: "checklistItem",
      insertSiblingOnEnter: true,
    });
    expect(isAllowedChild("checklist", "checklistItem")).toBe(true);
    expect(isAllowedChild("checklist", "text")).toBe(false);
    expect(canInsertSiblingInContainer("checklist")).toBe(true);
    expect(shouldLiftEmptyChildOnEnter("checklist")).toBe(true);
    expect(shouldLiftEmptyChildOnDelete("checklist")).toBe(true);
    expect(shouldLiftDisallowedChildConversion("checklist")).toBe(true);
  });
});

describe("applyBlockConversion", () => {
  it("dispatches container.wrap with ordered variant", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: {
        id: "block-1",
        type: "text",
        props: { text: "/ol item" },
      },
      children: [],
    };

    const commands: unknown[] = [];
    const dispatch = (command: unknown) => {
      commands.push(command);
    };

    applyBlockConversion(
      row,
      {
        key: "list-ordered",
        id: "list",
        listVariant: "ordered",
        label: "Numbered list",
        aliases: ["ol"],
        icon: IconListNumbers,
        keywords: ["numbered list"],
      },
      dispatch
    );

    expect(commands).toEqual([
      {
        type: "container.wrap",
        rowId: "row-1",
        containerType: "list",
        variant: "ordered",
        childText: "",
      },
    ]);
  });
});
