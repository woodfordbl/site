export type PageActivityEventType =
  | "page.created"
  | "page.metadata.updated"
  | "page.settings.updated"
  | "page.repositioned"
  | "page.duplicated"
  | "block.updated"
  | "block.inserted"
  | "block.deleted"
  | "block.reordered";

export interface PageActivityEvent {
  blockId?: string;
  blockType?: string;
  id: string;
  pageId: string;
  summary: string;
  timestamp: string;
  type: PageActivityEventType;
}

export const PAGE_ACTIVITY_EVENT_LIMIT = 100;

const BLOCK_TYPE_LABELS: Record<string, string> = {
  callout: "Callout",
  checklist: "Checklist",
  checklistItem: "Checklist item",
  column: "Column",
  columns: "Columns",
  divider: "Divider",
  embed: "Embed",
  heading: "Heading",
  list: "List",
  media: "Media",
  pageLink: "Page link",
  quote: "Quote",
  table: "Table",
  tableCell: "Table cell",
  tableRow: "Table row",
  text: "Text",
};

export function blockActivityLabel(blockType: string): string {
  return BLOCK_TYPE_LABELS[blockType] ?? "Block";
}
