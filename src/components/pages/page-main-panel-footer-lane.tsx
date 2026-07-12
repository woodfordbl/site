import type { ReactNode } from "react";

import { pageMainPanelFooterLaneClassName } from "@/lib/pages/page-main-panel-layout.ts";
import { cn } from "@/lib/utils.ts";

interface PageMainPanelFooterLaneProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Reserved space below the inset main panel on desktop. {@link PageInsetFooter}
 * renders controls here on page and database routes; settings uses an empty
 * spacer so the inset card height still matches.
 */
export function PageMainPanelFooterLane({
  children,
  className,
}: PageMainPanelFooterLaneProps) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      className={cn(pageMainPanelFooterLaneClassName, className)}
    >
      {children}
    </div>
  );
}
