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
