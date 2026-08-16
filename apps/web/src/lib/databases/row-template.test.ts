import { describe, expect, it } from "vitest";

import {
  defaultRowTemplateBlocks,
  instantiateTemplateBlocks,
  rowPropertyToken,
} from "@/lib/databases/row-template.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const fields: DatabaseField[] = [
  { id: "f-name", name: "Name", type: "text" },
  { id: "f-count", name: "Count", type: "number" },
  {
    id: "f-status",
    name: "Status",
    type: "select",
    options: [{ id: "opt-1", name: "Active" }],
  },
];

const values = { "f-name": "Widget", "f-count": 3, "f-status": "opt-1" };

describe("instantiateTemplateBlocks", () => {
  it("falls back to a single empty text block when the template is absent or empty", () => {
    for (const template of [undefined, []]) {
      const blocks = instantiateTemplateBlocks(template, fields, values);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("text");
      expect(blocks[0].props).toEqual({ text: "" });
    }
  });

  it("evaluates {{ thisPage.X }} tokens in text-bearing props", () => {
    const template: Block[] = [
      {
        id: "b-heading",
        type: "heading",
        props: { level: 1, text: "About {{ thisPage.Name }}" },
      },
      {
        id: "b-text",
        type: "text",
        props: { text: "{{ thisPage.Count }} in stock ({{thisPage.Status}})" },
      },
      {
        id: "b-quote",
        type: "quote",
        props: { text: "“{{ thisPage.Name }}”" },
      },
      {
        id: "b-toggle",
        type: "toggleHeading",
        props: { level: 2, text: "Notes on {{ thisPage.Name }}" },
      },
      { id: "b-checklist", type: "checklist", props: {} },
      {
        id: "b-check-item",
        parentId: "b-checklist",
        type: "checklistItem",
        props: { checked: false, text: "Review {{ thisPage.Name }}" },
      },
      {
        id: "b-cell",
        type: "tableCell",
        props: { text: "{{ thisPage.Count }}" },
      },
      {
        id: "b-tab",
        type: "tab",
        props: { label: "{{ thisPage.Status }}" },
      },
      {
        id: "b-embed",
        type: "embed",
        props: {
          url: "https://example.com/{{ thisPage.Name }}",
          caption: "Chart for {{ thisPage.Name }}",
        },
      },
    ];

    const blocks = instantiateTemplateBlocks(template, fields, values);
    const byId = new Map(blocks.map((block) => [block.id, block]));

    expect(byId.get("b-heading")?.props).toMatchObject({
      text: "About Widget",
    });
    expect(byId.get("b-text")?.props).toMatchObject({
      text: "3 in stock (Active)",
    });
    expect(byId.get("b-quote")?.props).toMatchObject({ text: "“Widget”" });
    expect(byId.get("b-toggle")?.props).toMatchObject({
      text: "Notes on Widget",
    });
    expect(byId.get("b-check-item")?.props).toMatchObject({
      text: "Review Widget",
      checked: false,
    });
    expect(byId.get("b-cell")?.props).toMatchObject({ text: "3" });
    expect(byId.get("b-tab")?.props).toMatchObject({ label: "Active" });
    // Embed: authored caption evaluates; the provider URL stays literal.
    expect(byId.get("b-embed")?.props).toMatchObject({
      url: "https://example.com/{{ thisPage.Name }}",
      caption: "Chart for Widget",
    });
  });

  it("keeps code blocks literal", () => {
    const template: Block[] = [
      {
        id: "b-code",
        type: "code",
        props: { text: "print('{{ thisPage.Name }}')", language: "python" },
      },
    ];

    const [block] = instantiateTemplateBlocks(template, fields, values);
    expect(block.props).toEqual({
      text: "print('{{ thisPage.Name }}')",
      language: "python",
    });
  });

  it("renders unknown properties as inline errors, never throwing", () => {
    const template: Block[] = [
      { id: "b-1", type: "text", props: { text: "{{ thisPage.Nope }}" } },
    ];

    const [block] = instantiateTemplateBlocks(template, fields, values);
    expect((block.props as { text: string }).text).toContain("⚠");
    expect((block.props as { text: string }).text).toContain("Nope");
  });

  it("preserves ids and parentId links and never mutates the input", () => {
    const template: Block[] = [
      { id: "b-callout", type: "callout", props: { icon: "💡" } },
      {
        id: "b-child",
        parentId: "b-callout",
        type: "text",
        props: { text: "Hi {{ thisPage.Name }}" },
      },
    ];
    const snapshot = structuredClone(template);

    const blocks = instantiateTemplateBlocks(template, fields, values);

    expect(blocks[0]).toBe(template[0]); // untouched blocks pass through
    expect(blocks[1].id).toBe("b-child");
    expect(blocks[1].parentId).toBe("b-callout");
    expect((blocks[1].props as { text: string }).text).toBe("Hi Widget");
    expect(template).toEqual(snapshot);
  });

  it("leaves token-free text untouched (identity fast path)", () => {
    const template: Block[] = [
      { id: "b-1", type: "text", props: { text: "Plain prose" } },
    ];

    const [block] = instantiateTemplateBlocks(template, fields, values);
    expect(block).toBe(template[0]);
  });
});

describe("defaultRowTemplateBlocks", () => {
  it("uses a stable block id so virtual re-renders keep row identity", () => {
    const [first] = defaultRowTemplateBlocks();
    const [second] = defaultRowTemplateBlocks();
    expect(first.id).toBe(second.id);
  });
});

describe("rowPropertyToken", () => {
  it("uses the dot form for identifier-safe names", () => {
    expect(rowPropertyToken("Status")).toBe("{{ thisPage.Status }}");
    expect(rowPropertyToken("  Due_date ")).toBe("{{ thisPage.Due_date }}");
  });

  it("uses the quoted bracket form for names with spaces or symbols", () => {
    expect(rowPropertyToken("Start date")).toBe('{{ thisPage["Start date"] }}');
    expect(rowPropertyToken("Cost ($)")).toBe('{{ thisPage["Cost ($)"] }}');
  });

  it("escapes quotes and backslashes in bracketed names", () => {
    expect(rowPropertyToken('Say "hi"')).toBe('{{ thisPage["Say \\"hi\\""] }}');
  });

  it("round-trips through instantiation", () => {
    const spacedFields: DatabaseField[] = [
      { id: "f-due", name: "Start date", type: "text" },
    ];
    const template: Block[] = [
      {
        id: "b-1",
        type: "text",
        props: { text: `Begins ${rowPropertyToken("Start date")}` },
      },
    ];
    const [block] = instantiateTemplateBlocks(template, spacedFields, {
      "f-due": "soon",
    });
    expect((block.props as { text: string }).text).toBe("Begins soon");
  });
});
