import { IconWorld } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmbedSourcePicker } from "@/components/blocks/types/embed/embed-source-picker.tsx";
import { EmbedView } from "@/components/blocks/types/embed/embed-view.tsx";
import { useCanvasFocus } from "@/components/canvas/canvas-editor-context.tsx";
import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { SourceLinkPanel } from "@/components/ui/source-link-panel.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import { useUnfurlEmbedUrl } from "@/hooks/use-unfurl-embed-url.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { mergeEmbedUnfurlPreview } from "@/lib/media/merge-embed-unfurl.ts";
import { resolveEmbedDisplay } from "@/lib/media/resolve-embed-display.ts";
import type { EmbedProps } from "@/lib/schemas/block-props.ts";

type EmbedEditProps = BlockEditProps<"embed">;

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
  const focus = useCanvasFocus();
  const [pickerOpen, setPickerOpen] = useState(false);
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const unfurlAttemptedRef = useRef<string | null>(null);
  const unfurl = useUnfurlEmbedUrl();
  const hasUrl = props.url.trim().length > 0;
  const display = hasUrl ? resolveEmbedDisplay(props.url) : null;
  const isBookmarkLoading =
    display?.kind === "bookmark" &&
    !props.imageUrl?.trim() &&
    (unfurl.isPending || unfurlAttemptedRef.current === props.url);

  const applyAutoFocus = useCallback(() => {
    if (focus?.embedAction === "replace") {
      setPickerOpen(true);
      onAutoFocusHandled?.();
      return;
    }

    if (focus?.embedAction === "caption") {
      queueMicrotask(() => {
        const shell = focusRef.current?.closest("[data-canvas-row-id]");
        const field = shell?.querySelector("input, textarea");
        if (field instanceof HTMLElement) {
          field.focus();
        }
        onAutoFocusHandled?.();
      });
      return;
    }

    focusRef.current?.focus();
    if (!hasUrl) {
      setPickerOpen(true);
    }
    onAutoFocusHandled?.();
  }, [focus?.embedAction, hasUrl, onAutoFocusHandled]);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
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
          onChange(mergeEmbedUnfurlPreview(baseProps, url, preview));
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

  const handleUrlSubmit = (normalized: string) => {
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
    setPickerOpen(false);
  };

  if (!hasUrl) {
    return (
      <EmbedSourcePicker
        onOpenChange={setPickerOpen}
        onSubmit={handleUrlSubmit}
        open={pickerOpen}
      >
        <PlaceholderTrigger
          icon={<IconWorld />}
          onKeyDown={handleKeyDown}
          ref={focusRef as React.RefObject<HTMLButtonElement>}
        >
          Embed files and supported websites
        </PlaceholderTrigger>
      </EmbedSourcePicker>
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
      {props.showCaption ? (
        <EditableSurface
          ariaLabel="Embed caption"
          className="text-muted-foreground text-sm italic"
          onChange={(caption) => {
            onChange({ ...props, caption });
          }}
          placeholder="Embed Caption"
          placeholderVisibility="when-focused"
          value={props.caption ?? ""}
        />
      ) : null}
      <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
        <PopoverContent
          anchor={focusRef}
          className="w-80"
          finalFocus={false}
          initialFocus={false}
        >
          <SourceLinkPanel
            onSubmit={handleUrlSubmit}
            placeholder="Paste in https://…"
            submitLabel="Embed link"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
