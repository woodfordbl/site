import { MediaFrame } from "@/components/blocks/types/media/media-frame.tsx";
import {
  resolveMediaDisplayUrl,
  useAssetObjectUrl,
} from "@/hooks/use-asset-object-url.ts";
import type { MediaProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

interface MediaViewProps {
  className?: string;
  onWidthChange?: (widthPercent: number) => void;
  props: MediaProps;
}

export function MediaView({ className, onWidthChange, props }: MediaViewProps) {
  const assetObjectUrl = useAssetObjectUrl(
    props.source === "asset" ? props.src : undefined
  );
  const displayUrl = resolveMediaDisplayUrl(
    props.source,
    props.src,
    assetObjectUrl
  );

  if (!displayUrl) {
    return (
      <div className={cn("text-muted-foreground text-sm", className)}>
        No media selected
      </div>
    );
  }

  const alt = props.alt ?? props.fileName ?? "Media";

  return (
    <MediaFrame
      alt={alt}
      className={className}
      displayUrl={displayUrl}
      onWidthChange={onWidthChange}
      props={props}
    />
  );
}
