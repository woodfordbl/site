import { appendPageActivityEvent } from "@/db/activity/page-activity-store.ts";
import type { PageActivityEventType } from "@/lib/pages/page-activity-events.ts";
import type { PageFont, PageTextScale } from "@/lib/schemas/page-settings.ts";

function queueActivityEvent(
  pageId: string,
  type: PageActivityEventType,
  summary: string,
  details?: { blockId?: string; blockType?: string }
): void {
  appendPageActivityEvent(pageId, {
    type,
    summary,
    timestamp: new Date().toISOString(),
    blockId: details?.blockId,
    blockType: details?.blockType,
  }).catch(() => undefined);
}

export function recordPageSettingsActivity(
  pageId: string,
  summary: string
): void {
  queueActivityEvent(pageId, "page.settings.updated", summary);
}

function fontSettingLabel(font: PageFont): string {
  if (font === "serif") {
    return "Serif";
  }
  if (font === "mono") {
    return "Mono";
  }
  return "Default";
}

export function recordFontSettingActivity(
  pageId: string,
  font: PageFont
): void {
  recordPageSettingsActivity(
    pageId,
    `Changed font to ${fontSettingLabel(font)}`
  );
}

function textScaleSettingLabel(textScale: PageTextScale): string {
  if (textScale === "small") {
    return "Small";
  }
  if (textScale === "large") {
    return "Large";
  }
  return "Default";
}

export function recordTextScaleSettingActivity(
  pageId: string,
  textScale: PageTextScale | null
): void {
  recordPageSettingsActivity(
    pageId,
    textScale === null
      ? "Changed text size to site default"
      : `Changed text size to ${textScaleSettingLabel(textScale)}`
  );
}

export function recordHeaderImageSettingActivity(
  pageId: string,
  hasCover: boolean
): void {
  recordPageSettingsActivity(
    pageId,
    hasCover ? "Updated cover image" : "Removed cover image"
  );
}

export function recordFullWidthSettingActivity(
  pageId: string,
  enabled: boolean
): void {
  recordPageSettingsActivity(
    pageId,
    enabled ? "Turned on full width" : "Turned off full width"
  );
}

