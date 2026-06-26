import { createStore, get, set } from "idb-keyval";

import {
  PAGE_ACTIVITY_EVENT_LIMIT,
  type PageActivityEvent,
} from "@/lib/pages/page-activity-events.ts";

const activityStore = createStore("site-page-activity", "events");

function activityKey(pageId: string): string {
  return pageId;
}

function assertActivityStoreAvailable(): void {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
}

export async function readPageActivityEvents(
  pageId: string,
  limit = PAGE_ACTIVITY_EVENT_LIMIT
): Promise<PageActivityEvent[]> {
  if (typeof indexedDB === "undefined") {
    return [];
  }

  const events =
    (await get<PageActivityEvent[]>(activityKey(pageId), activityStore)) ?? [];
  return events.slice(0, limit);
}

export async function appendPageActivityEvent(
  pageId: string,
  event: Omit<PageActivityEvent, "id" | "pageId">
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  assertActivityStoreAvailable();
  const existing =
    (await get<PageActivityEvent[]>(activityKey(pageId), activityStore)) ?? [];
  const next: PageActivityEvent[] = [
    {
      ...event,
      id: crypto.randomUUID(),
      pageId,
    },
    ...existing,
  ].slice(0, PAGE_ACTIVITY_EVENT_LIMIT);

  await set(activityKey(pageId), next, activityStore);
}

export async function clearPageActivity(pageId: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await set(activityKey(pageId), [], activityStore);
}
