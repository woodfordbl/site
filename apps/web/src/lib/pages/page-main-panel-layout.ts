/**
 * Desktop footer lane under the inset main panel (`data-page-main-panel`).
 * Pairs with the sidebar chrome wrapper's `md:pt-2` so the rounded card has
 * matching breathing room at the bottom of the viewport. Mobile omits the lane
 * — the document scrolls and it would add dead space below the content.
 *
 * Height matches the page workspace settings footer row (`h-9` / 36px).
 */
export const pageMainPanelFooterLaneClassName = "h-9 shrink-0 max-md:hidden";
