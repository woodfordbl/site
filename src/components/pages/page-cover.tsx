"use client";

import {
  resolveMediaDisplayUrl,
  useAssetObjectUrl,
} from "@/hooks/use-asset-object-url.ts";
import { UNSPLASH_HOME_URL, withUnsplashUtm } from "@/lib/media/unsplash.ts";
import {
  DEFAULT_HEADER_FOCAL_Y,
  type PageHeaderImage,
} from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

interface PageCoverProps {
  className?: string;
  headerImage: PageHeaderImage | undefined;
}

/** Photographer + Unsplash link-back, required when a cover is sourced from Unsplash. */
function UnsplashCredit({
  credit,
}: {
  credit: NonNullable<PageHeaderImage["credit"]>;
}) {
  return (
    <div className="pointer-events-none absolute right-2 bottom-2 z-[1] flex max-w-[80%] items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] text-white/90 leading-none backdrop-blur-sm">
      <span className="truncate">
        Photo by{" "}
        <a
          className="pointer-events-auto underline decoration-white/40 underline-offset-2 hover:decoration-white"
          href={withUnsplashUtm(credit.link)}
          rel="noreferrer"
          target="_blank"
        >
          {credit.name}
        </a>{" "}
        on{" "}
        <a
          className="pointer-events-auto underline decoration-white/40 underline-offset-2 hover:decoration-white"
          href={withUnsplashUtm(UNSPLASH_HOME_URL)}
          rel="noreferrer"
          target="_blank"
        >
          Unsplash
        </a>
      </span>
    </div>
  );
}

/**
 * Full-bleed page cover image. Returns `null` when the page has no cover, so it
 * is safe to render unconditionally. On mobile the breadcrumb header below it is
 * sticky + frosted, so the cover scrolls up and reads as glass behind the bar.
 */
export function PageCover({ className, headerImage }: PageCoverProps) {
  const assetObjectUrl = useAssetObjectUrl(
    headerImage?.source === "asset" ? headerImage.src : undefined
  );

  if (!headerImage) {
    return null;
  }

  const displayUrl = resolveMediaDisplayUrl(
    headerImage.source,
    headerImage.src,
    assetObjectUrl
  );

  if (!displayUrl) {
    // Asset blob still loading from IndexedDB — hold the layout with a placeholder.
    return (
      <div
        className={cn(
          "h-[26svh] max-h-72 min-h-32 w-full animate-pulse bg-muted",
          className
        )}
      />
    );
  }

  const focalY = headerImage.focalY ?? DEFAULT_HEADER_FOCAL_Y;

  return (
    <div
      className={cn(
        "relative h-[26svh] max-h-72 min-h-32 w-full overflow-hidden bg-muted",
        className
      )}
      data-page-cover=""
    >
      <img
        alt={headerImage.alt ?? ""}
        className="h-full w-full object-cover"
        decoding="async"
        draggable={false}
        height={480}
        src={displayUrl}
        style={{ objectPosition: `50% ${focalY}%` }}
        width={1600}
      />
      {headerImage.credit ? (
        <UnsplashCredit credit={headerImage.credit} />
      ) : null}
    </div>
  );
}
