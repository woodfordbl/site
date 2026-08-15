import { PageCanvasFooter } from "@/components/canvas/page-canvas-footer.tsx";
import { PageMainPanelFooterLane } from "@/components/pages/page-main-panel-footer-lane.tsx";
import { SiteSettingsTrigger } from "@/components/settings/site-settings-trigger.tsx";
import type { PageCanvasFooterActionsInput } from "@/hooks/use-page-canvas-footer-actions.ts";

type PageInsetFooterProps = {
  /** Page context for reset/dev actions; omit on database routes. */
  pageId?: string;
} & Pick<PageCanvasFooterActionsInput, "onAfterReset">;

/**
 * Shared desktop footer below the inset main panel. Canvas pages pass a
 * `pageId` for page-scoped dev actions; database routes omit it and still get
 * site-wide actions plus Settings. Settings itself uses an empty
 * {@link PageMainPanelFooterLane} — the trigger would be redundant there.
 */
export function PageInsetFooter({
  onAfterReset,
  pageId,
}: PageInsetFooterProps) {
  return (
    <PageMainPanelFooterLane className="pointer-events-none z-30 flex items-center justify-end gap-1 px-2 md:px-0">
      <PageCanvasFooter onAfterReset={onAfterReset} pageId={pageId ?? ""} />
      <SiteSettingsTrigger pageId={pageId} />
    </PageMainPanelFooterLane>
  );
}
