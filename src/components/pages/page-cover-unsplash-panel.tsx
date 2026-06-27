"use client";

import { IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import type {
  UnsplashSearchResponse,
  UnsplashSearchResult,
} from "@/lib/media/unsplash.ts";
import type { PageHeaderImage } from "@/lib/schemas/page-settings.ts";

interface PageCoverUnsplashPanelProps {
  onSelect: (headerImage: PageHeaderImage) => void;
}

async function searchUnsplash(term: string): Promise<UnsplashSearchResult[]> {
  const response = await fetch(
    `/api/unsplash/search?q=${encodeURIComponent(term)}`
  );
  const payload = (await response.json()) as
    | UnsplashSearchResponse
    | { error: string };
  if (!response.ok || "error" in payload) {
    const message =
      "error" in payload ? payload.error : "Unsplash search failed.";
    throw new Error(message);
  }
  return payload.results;
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
  onSelect,
}: PageCoverUnsplashPanelProps) {
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");

  const { data, error, isFetching } = useQuery({
    queryKey: ["unsplash-search", term],
    queryFn: () => searchUnsplash(term),
    enabled: term.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleSelect = (result: UnsplashSearchResult) => {
    triggerDownload(result.downloadLocation);
    onSelect({
      source: "url",
      src: result.regularUrl,
      alt: result.alt,
      credit: result.credit,
    });
  };

  return (
    <div className="flex flex-col gap-3" data-slot="unsplash-panel">
      <form
        className="flex gap-2"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          setTerm(draft.trim());
        }}
      >
        <Input
          aria-label="Search Unsplash"
          autoFocus
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          placeholder="Search Unsplash photos"
          value={draft}
        />
        <Button
          aria-label="Search"
          disabled={draft.trim().length === 0}
          size="icon"
          type="submit"
          variant="secondary"
        >
          <IconSearch aria-hidden />
        </Button>
      </form>

      {error ? (
        <p className="text-destructive text-sm">{(error as Error).message}</p>
      ) : null}

      {isFetching ? (
        <p className="text-muted-foreground text-sm">Searching…</p>
      ) : null}

      {data && data.length === 0 && !isFetching ? (
        <p className="text-muted-foreground text-sm">No photos found.</p>
      ) : null}

      {data && data.length > 0 ? (
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {data.map((result) => (
            <button
              className="group relative aspect-[4/3] overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={result.id}
              onClick={() => handleSelect(result)}
              title={
                result.alt
                  ? `${result.alt} — ${result.credit.name}`
                  : `Photo by ${result.credit.name}`
              }
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
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5 text-[10px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                {result.credit.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground leading-tight">
        Photos from Unsplash. Selecting one credits the photographer
        automatically.
      </p>
    </div>
  );
}
