import { IconWorld } from "@tabler/icons-react";

import { Skeleton } from "@/components/ui/skeleton.tsx";
import { resolveEmbedDisplay } from "@/lib/media/resolve-embed-display.ts";
import type { EmbedProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

interface EmbedViewProps {
  className?: string;
  isLoading?: boolean;
  props: EmbedProps;
}

function embedHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function EmbedCaptions({ props, url }: { props: EmbedProps; url: string }) {
  const title = props.title?.trim();
  const showTitle = props.showTitle && title;
  const showUrl = props.showUrl;

  if (!(showTitle || showUrl)) {
    return null;
  }

  return (
    <div className="space-y-1 px-1">
      {showTitle ? (
        <p className="text-muted-foreground text-sm italic">{title}</p>
      ) : null}
      {showUrl ? (
        <p className="truncate text-muted-foreground text-sm italic">{url}</p>
      ) : null}
    </div>
  );
}

function EmbedLoadingSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("aspect-video w-full", className)} />;
}

export function EmbedView({
  className,
  isLoading = false,
  props,
}: EmbedViewProps) {
  const url = props.url.trim();
  if (!url) {
    return (
      <div className={cn("text-muted-foreground text-sm", className)}>
        No URL provided
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("w-full space-y-2", className)}>
        <EmbedLoadingSkeleton />
      </div>
    );
  }

  const display = resolveEmbedDisplay(url);

  if (display.kind === "provider" && display.provider) {
    return (
      <div className={cn("w-full space-y-2", className)}>
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            src={display.provider.embedUrl}
            title={props.title ?? `${display.provider.provider} embed`}
          />
        </div>
        <EmbedCaptions props={props} url={url} />
      </div>
    );
  }

  if (display.kind === "directImage") {
    return (
      <div className={cn("w-full space-y-2", className)}>
        <img
          alt={props.title?.trim() || "Embedded image"}
          className="max-h-[480px] w-full rounded-md object-contain"
          height={480}
          loading="lazy"
          src={url}
          width={800}
        />
        <EmbedCaptions props={props} url={url} />
      </div>
    );
  }

  const imageUrl = props.imageUrl?.trim();

  return (
    <div className={cn("w-full space-y-2", className)}>
      {imageUrl ? (
        <a
          className="relative block aspect-video w-full overflow-hidden rounded-md bg-muted"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <img
            alt={props.title?.trim() || embedHostname(url)}
            className="absolute inset-0 h-full w-full object-cover"
            height={480}
            loading="lazy"
            src={imageUrl}
            width={800}
          />
        </a>
      ) : (
        <a
          className="flex aspect-video w-full items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-muted-foreground text-sm transition-colors hover:bg-muted/60"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <IconWorld className="size-4 shrink-0" />
          <span className="truncate px-4">{embedHostname(url)}</span>
        </a>
      )}
      <EmbedCaptions props={props} url={url} />
    </div>
  );
}
