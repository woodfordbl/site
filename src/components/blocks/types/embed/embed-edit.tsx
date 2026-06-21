import { IconWorld } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmbedView } from "@/components/blocks/types/embed/embed-view.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import { useUnfurlEmbedUrl } from "@/hooks/use-unfurl-embed-url.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { resolveEmbedDisplay } from "@/lib/media/resolve-embed-display.ts";
import { normalizeEmbedUrl } from "@/lib/media/resolve-embed-provider.ts";
import type { EmbedProps } from "@/lib/schemas/block-props.ts";

type EmbedEditProps = BlockEditProps<"embed">;

function mergeUnfurlPreview(
  props: EmbedProps,
  url: string,
  preview: { description?: string; imageUrl?: string; title?: string }
): EmbedProps {
  return {
    ...props,
    url,
    ...(preview.title ? { title: preview.title } : {}),
    ...(preview.description ? { description: preview.description } : {}),
    ...(preview.imageUrl ? { imageUrl: preview.imageUrl } : {}),
  };
}

export function EmbedEdit({
  autoFocus,
  onAutoFocusHandled,
  onChange,
  props,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
}: EmbedEditProps) {
  const [urlDraft, setUrlDraft] = useState("");
  const focusRef = useRef<HTMLDivElement | HTMLInputElement>(null);
  const unfurlAttemptedRef = useRef<string | null>(null);
  const unfurl = useUnfurlEmbedUrl();
  const hasUrl = props.url.trim().length > 0;
  const display = hasUrl ? resolveEmbedDisplay(props.url) : null;
  const isBookmarkLoading =
    display?.kind === "bookmark" &&
    !props.imageUrl?.trim() &&
    (unfurl.isPending || unfurlAttemptedRef.current === props.url);

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
  }, []);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useInlineCustomBlockKeys({
    onExtendSelectionDown,
    onExtendSelectionUp,
    onMoveRowDown,
    onMoveRowUp,
    onNavigateDown,
    onNavigateUp,
    onStructuralKey,
  });
  const runBookmarkUnfurl = useCallback(
    (url: string, baseProps: EmbedProps) => {
      unfurlAttemptedRef.current = url;
      unfurl.mutate(url, {
        onSuccess: (preview) => {
          onChange(mergeUnfurlPreview(baseProps, url, preview));
        },
      });
    },
    [onChange, unfurl]
  );

  useEffect(() => {
    if (!hasUrl || props.imageUrl?.trim()) {
      return;
    }
    const resolution = resolveEmbedDisplay(props.url);
    if (resolution.kind !== "bookmark") {
      return;
    }
    if (unfurlAttemptedRef.current === props.url) {
      return;
    }
    runBookmarkUnfurl(props.url, props);
  }, [hasUrl, props, runBookmarkUnfurl]);

  const handleUrlSubmit = () => {
    const normalized = normalizeEmbedUrl(urlDraft);
    if (!normalized) {
      return;
    }

    const resolution = resolveEmbedDisplay(normalized);
    if (resolution.kind === "bookmark") {
      const nextProps: EmbedProps = {
        ...props,
        url: normalized,
        imageUrl: undefined,
      };
      onChange(nextProps);
      runBookmarkUnfurl(normalized, nextProps);
    } else {
      onChange({
        ...props,
        url: normalized,
        imageUrl: undefined,
      });
    }
    setUrlDraft("");
  };

  if (!hasUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <IconWorld />
          Paste a URL to embed
        </div>
        <Input
          className="px-1"
          onChange={(event) => setUrlDraft(event.target.value)}
          onKeyDown={(event) => {
            handleKeyDown(event);
            if (event.key === "Enter") {
              event.preventDefault();
              handleUrlSubmit();
            }
          }}
          placeholder="https://youtube.com/watch?v=…"
          ref={focusRef as React.RefObject<HTMLInputElement>}
          value={urlDraft}
        />
        <Button
          disabled={!urlDraft.trim()}
          onClick={handleUrlSubmit}
          size="sm"
          type="button"
          variant="outline"
        >
          Embed URL
        </Button>
      </div>
    );
  }

  return (
    // Visible focus target: keyboard users see where structural keys apply.
    // The frame hosts its own interactive children (toolbar, resize handles),
    // so a wrapping <button> would be invalid — a focusable group is correct.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
    // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
    <div
      aria-label="Embed block"
      className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onKeyDown={handleKeyDown}
      ref={focusRef as React.RefObject<HTMLDivElement>}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block itself is the keyboard target
      tabIndex={0}
    >
      <EmbedView isLoading={isBookmarkLoading} props={props} />
    </div>
  );
}
