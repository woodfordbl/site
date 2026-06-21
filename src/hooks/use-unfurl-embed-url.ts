import { useMutation } from "@tanstack/react-query";
import type { UrlPreview } from "@/lib/media/parse-url-preview.ts";
import { unfurlEmbedUrl } from "@/lib/media/unfurl-embed-url.ts";

export function useUnfurlEmbedUrl() {
  return useMutation({
    mutationFn: async (url: string): Promise<UrlPreview> =>
      unfurlEmbedUrl({ data: { url } }),
  });
}
