import { useRef, useState } from "react";

import { MediaHoverToolbar } from "@/components/blocks/types/media/media-hover-toolbar.tsx";
import { MediaLightbox } from "@/components/blocks/types/media/media-lightbox.tsx";
import { MediaVideoPlayer } from "@/components/blocks/types/media/media-video-player.tsx";
import { useMediaResize } from "@/components/blocks/types/media/use-media-resize.ts";
import { ResizeHandle } from "@/components/ui/resize-handle.tsx";
import { useObjectContainBounds } from "@/hooks/use-object-contain-bounds.ts";
import { mediaResizeHandlePosition } from "@/lib/dom/media-resize-handle-position.ts";
import type { NaturalMediaSize } from "@/lib/dom/object-contain-bounds.ts";
import type { MediaProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

interface MediaFrameProps {
  alt: string;
  className?: string;
  displayUrl: string;
  onWidthChange?: (widthPercent: number) => void;
  props: MediaProps;
}

const mediaElementClassName = "max-h-[480px] w-full rounded-md object-contain";

const resizeHandleVisibilityClassName = cn(
  "pointer-events-auto z-10 opacity-0 transition-opacity duration-150 ease-[var(--ease-out-strong)]",
  "group-focus-within/media:opacity-100 group-hover/media:opacity-100",
  "active:opacity-100",
  "hover:[&_span]:border-foreground/25 hover:[&_span]:shadow-md"
);

export function MediaFrame({
  alt,
  className,
  displayUrl,
  onWidthChange,
  props,
}: MediaFrameProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mediaElement, setMediaElement] = useState<
    HTMLImageElement | HTMLVideoElement | null
  >(null);
  const [naturalSize, setNaturalSize] = useState<NaturalMediaSize | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const contentBounds = useObjectContainBounds(mediaElement, naturalSize);
  const { displayWidthPercent, isResizable, isResizing, startResize } =
    useMediaResize({
      frameRef,
      onWidthChange,
      widthPercent: props.widthPercent,
    });

  const handleNaturalSize = (size: NaturalMediaSize) => {
    if (size.width > 0 && size.height > 0) {
      setNaturalSize(size);
    }
  };

  return (
    <figure className={cn("w-full", className)}>
      <div
        className="group/media relative mx-auto touch-none"
        data-media-frame
        ref={frameRef}
        style={{ width: `${displayWidthPercent}%` }}
      >
        <div className="relative">
          {props.kind === "video" ? (
            <MediaVideoPlayer
              className={mediaElementClassName}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                handleNaturalSize({
                  width: video.videoWidth,
                  height: video.videoHeight,
                });
              }}
              ref={setMediaElement}
              src={displayUrl}
            />
          ) : (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad measures natural size; not a user interaction
            <img
              alt={alt}
              className={mediaElementClassName}
              height={480}
              loading="lazy"
              onLoad={(event) => {
                const image = event.currentTarget;
                handleNaturalSize({
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                });
              }}
              ref={setMediaElement}
              src={displayUrl}
              width={800}
            />
          )}

          {isResizable && contentBounds ? (
            <>
              <ResizeHandle
                ariaLabel="Resize media from left"
                className={cn(
                  "absolute",
                  resizeHandleVisibilityClassName,
                  isResizing && "pointer-events-none opacity-0"
                )}
                onResizeStart={(event) => startResize("left", event)}
                style={mediaResizeHandlePosition("left", contentBounds)}
                variant="pill"
              />
              <ResizeHandle
                ariaLabel="Resize media from right"
                className={cn(
                  "absolute",
                  resizeHandleVisibilityClassName,
                  isResizing && "pointer-events-none opacity-0"
                )}
                onResizeStart={(event) => startResize("right", event)}
                style={mediaResizeHandlePosition("right", contentBounds)}
                variant="pill"
              />
            </>
          ) : null}
        </div>

        <MediaHoverToolbar
          displayUrl={displayUrl}
          onView={() => setLightboxOpen(true)}
          props={props}
        />
      </div>

      <MediaLightbox
        alt={alt}
        displayUrl={displayUrl}
        kind={props.kind}
        naturalSize={naturalSize}
        onOpenChange={setLightboxOpen}
        open={lightboxOpen}
      />
    </figure>
  );
}
