import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { type Ref, useRef, useState } from "react";

import { cn } from "@/lib/utils.ts";

interface MediaVideoPlayerProps {
  className?: string;
  onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>;
  preload?: HTMLVideoElement["preload"];
  ref?: Ref<HTMLVideoElement>;
  src: string;
}

export function MediaVideoPlayer({
  className,
  onLoadedMetadata,
  preload = "metadata",
  ref: videoRef,
  src,
}: MediaVideoPlayerProps) {
  const [isPaused, setIsPaused] = useState(true);
  const internalRef = useRef<HTMLVideoElement | null>(null);

  const setRefs = (element: HTMLVideoElement | null) => {
    internalRef.current = element;
    if (typeof videoRef === "function") {
      videoRef(element);
      return;
    }
    if (videoRef && "current" in videoRef) {
      videoRef.current = element;
    }
  };

  const play = async () => {
    const video = internalRef.current;
    if (!video) {
      return;
    }

    try {
      await video.play();
    } catch {
      setIsPaused(true);
    }
  };

  const pause = () => {
    internalRef.current?.pause();
  };

  return (
    <div className="group/video relative">
      <video
        className={className}
        onClick={() => {
          if (!isPaused) {
            pause();
          }
        }}
        onEnded={() => setIsPaused(true)}
        onLoadedMetadata={(event) => {
          setIsPaused(event.currentTarget.paused);
          onLoadedMetadata?.(event);
        }}
        onPause={() => setIsPaused(true)}
        onPlay={() => setIsPaused(false)}
        playsInline
        preload={preload}
        ref={setRefs}
        src={src}
      >
        <track kind="captions" />
      </video>

      {isPaused ? (
        <button
          aria-label="Play video"
          className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-md"
          onClick={(event) => {
            event.stopPropagation();
            play().catch(() => undefined);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              "flex size-20 items-center justify-center rounded-full",
              "bg-white/55 shadow-sm backdrop-blur-md",
              "transition-transform duration-200 ease-[var(--ease-out-strong)]",
              "[@media(hover:hover)_and_(pointer:fine)]:group-hover/video:scale-105"
            )}
          >
            <IconPlayerPlayFilled className="ml-1 size-9 text-foreground/75" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
