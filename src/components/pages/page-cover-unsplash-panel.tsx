"use client";

import { IconSearch } from "@tabler/icons-react";
import {
  infiniteQueryOptions,
  type QueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  UNSPLASH_PAGE_SIZE,
  type UnsplashSearchResponse,
  type UnsplashSearchResult,
  withUnsplashUtm,
} from "@/lib/media/unsplash.ts";
import type { PageHeaderImage } from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

interface PageCoverUnsplashPanelProps {
  /** When true, the dialog/drawer is open so the feed / current search loads. */
  active: boolean;
  /** When true (mobile drawer), the panel + scroll area stretch to fill height. */
  fillHeight: boolean;
  onSelect: (headerImage: PageHeaderImage) => void;
}

async function fetchUnsplashPage(
  term: string,
  page: number
): Promise<UnsplashSearchResponse> {
  const response = await fetch(
    `/api/unsplash/search?q=${encodeURIComponent(term)}&page=${page}`
  );
  const payload = (await response.json()) as
    | UnsplashSearchResponse
    | { error: string };
  if (!response.ok || "error" in payload) {
    const message =
      "error" in payload ? payload.error : "Unsplash search failed.";
    throw new Error(message);
  }
  return payload;
}

/** Shared infinite-query options so the panel and hover-prefetch share a cache entry. */
export function unsplashInfiniteQueryOptions(term: string) {
  return infiniteQueryOptions({
    queryKey: ["unsplash", term] as const,
    queryFn: ({ pageParam }) => fetchUnsplashPage(term, pageParam),
    initialPageParam: 1,
    // The popular feed has no total count, so page off result fullness — works
    // for both the feed and search (a short page means there is no next page).
    getNextPageParam: (lastPage, allPages) =>
      lastPage.results.length >= UNSPLASH_PAGE_SIZE
        ? allPages.length + 1
        : undefined,
    staleTime: 5 * 60 * 1000,
  });
}

/** Warms the default Unsplash feed so the picker opens with images already loaded. */
export function prefetchUnsplashDefaults(queryClient: QueryClient): void {
  queryClient
    .prefetchInfiniteQuery(unsplashInfiniteQueryOptions(""))
    .catch(() => undefined);
}

/** Fire-and-forget Unsplash download trigger (required attribution telemetry). */
function triggerDownload(downloadLocation: string): void {
  fetch("/api/unsplash/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadLocation }),
  }).catch(() => undefined);
}

export function PageCoverUnsplashPanel({
  active,
  fillHeight,
  onSelect,
}: PageCoverUnsplashPanelProps) {
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce the search box → query term.
  useEffect(() => {
    const id = setTimeout(() => setTerm(draft.trim()), 350);
    return () => clearTimeout(id);
  }, [draft]);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...unsplashInfiniteQueryOptions(term),
    enabled: active,
  });

  const results = data?.pages.flatMap((page) => page.results) ?? [];

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  useEffect(() => {
    if (!viewportEl) {
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: viewportEl, rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewportEl, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSelect = (result: UnsplashSearchResult) => {
    triggerDownload(result.downloadLocation);
    onSelect({
      source: "url",
      src: result.rawUrl,
      alt: result.alt,
      credit: result.credit,
    });
  };

  return (
    <div
      className={cn("flex flex-col gap-3", fillHeight && "min-h-0 flex-1")}
      data-slot="unsplash-panel"
    >
      <InputGroup className="shrink-0">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch aria-hidden />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search Unsplash photos"
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          placeholder="Search…"
          value={draft}
        />
      </InputGroup>

      {error ? (
        <p className="shrink-0 text-destructive text-sm">
          {(error as Error).message}
        </p>
      ) : null}

      <ScrollArea
        className={cn("w-full", fillHeight ? "min-h-0 flex-1" : "h-[420px]")}
        viewportClassName="overscroll-contain pr-2"
        viewportRef={setViewportEl}
      >
        {results.length === 0 && !isFetching ? (
          <p className="text-muted-foreground text-sm">No photos found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {results.map((result) => (
              <figure className="flex flex-col gap-1" key={result.id}>
                <button
                  className="group relative aspect-[4/3] overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleSelect(result)}
                  title={result.alt || `Photo by ${result.credit.name}`}
                  type="button"
                >
                  <img
                    alt={result.alt}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    height={300}
                    loading="lazy"
                    src={result.thumbUrl}
                    width={400}
                  />
                </button>
                <figcaption className="truncate px-0.5 text-muted-foreground text-xs">
                  <a
                    className="hover:text-foreground hover:underline"
                    href={withUnsplashUtm(result.credit.link)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {result.credit.name}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <div aria-hidden className="h-1" ref={sentinelRef} />
        {isFetchingNextPage ? (
          <p className="py-2 text-center text-muted-foreground text-xs">
            Loading…
          </p>
        ) : null}
      </ScrollArea>
    </div>
  );
}
