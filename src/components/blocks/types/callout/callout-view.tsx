import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  bodyTextClassName,
  listMarkerCellClassName,
} from "@/lib/blocks/block-spacing.ts";
import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type CalloutViewProps = BlockViewProps<"callout">;

export function CalloutView({ props }: CalloutViewProps) {
  const resolvedIcon = props.icon ?? DEFAULT_CALLOUT_ICON;

  return (
    <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
      <div className={listMarkerCellClassName}>
        <span className={iconSlotClassName("icon-sm")}>
          <PageIconDisplay icon={resolvedIcon} />
        </span>
      </div>
      <p className={cn("min-w-0 flex-1 text-pretty", bodyTextClassName)}>
        {props.text || "\u00A0"}
      </p>
    </div>
  );
}
