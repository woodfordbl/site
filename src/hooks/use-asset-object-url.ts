import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { getAsset } from "@/db/assets/asset-store.ts";

const objectUrlCache = new Map<string, { refs: number; url: string }>();

function acquireObjectUrl(assetId: string, blob: Blob): string {
  const cached = objectUrlCache.get(assetId);
  if (cached) {
    cached.refs += 1;
    return cached.url;
  }
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(assetId, { refs: 1, url });
  return url;
}

function releaseObjectUrl(assetId: string): void {
  const cached = objectUrlCache.get(assetId);
  if (!cached) {
    return;
  }
  cached.refs -= 1;
  if (cached.refs <= 0) {
    URL.revokeObjectURL(cached.url);
    objectUrlCache.delete(assetId);
  }
}

export function assetObjectUrlQueryKey(assetId: string) {
  return ["asset-object-url", assetId] as const;
}

async function loadAssetObjectUrl(assetId: string): Promise<string | null> {
  const blob = await getAsset(assetId);
  if (!blob) {
    return null;
  }
  return acquireObjectUrl(assetId, blob);
}

export function useAssetObjectUrl(assetId: string | undefined): string | null {
  const { data } = useQuery({
    queryKey: assetId
      ? assetObjectUrlQueryKey(assetId)
      : ["asset-object-url", "empty"],
    queryFn: () => {
      if (!assetId) {
        return null;
      }
      return loadAssetObjectUrl(assetId);
    },
    enabled: Boolean(assetId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!(assetId && data)) {
      return;
    }
    return () => {
      releaseObjectUrl(assetId);
    };
  }, [assetId, data]);

  return data ?? null;
}

export function resolveMediaDisplayUrl(
  source: "url" | "asset",
  src: string,
  assetObjectUrl: string | null
): string | null {
  if (!src) {
    return null;
  }
  if (source === "url") {
    return src;
  }
  return assetObjectUrl;
}
