import { IconPhoto } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

import { MediaView } from "@/components/blocks/types/media/media-view.tsx";
import { LinkUploadTabs } from "@/components/ui/link-upload-tabs.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { SourceLinkPanel } from "@/components/ui/source-link-panel.tsx";
import { SourceUploadPanel } from "@/components/ui/source-upload-panel.tsx";
import { putAsset } from "@/db/assets/asset-store.ts";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import {
  inferMediaKindFromMime,
  inferMediaKindFromUrl,
} from "@/lib/media/infer-media-kind.ts";
import { parseValidatedUrlInput } from "@/lib/schemas/url-input.ts";

type MediaEditProps = BlockEditProps<"media">;

export function MediaEdit({
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
}: MediaEditProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const hasMedia = props.src.trim().length > 0;

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
    if (!hasMedia) {
      setPickerOpen(true);
    }
  }, [hasMedia]);

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

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const { assetId, mimeType } = await putAsset(file);
      onChange({
        kind: inferMediaKindFromMime(mimeType),
        source: "asset",
        src: assetId,
        mimeType,
        fileName: file.name,
        alt: props.alt,
      });
      setPickerOpen(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = (url: string) => {
    const normalized = parseValidatedUrlInput(url);
    if (!normalized) {
      return;
    }
    onChange({
      kind: inferMediaKindFromUrl(normalized),
      source: "url",
      src: normalized,
      alt: props.alt,
    });
    setPickerOpen(false);
  };

  if (!hasMedia) {
    return (
      <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
        <PopoverTrigger
          render={
            <PlaceholderTrigger
              icon={<IconPhoto />}
              onKeyDown={handleKeyDown}
              ref={focusRef as React.RefObject<HTMLButtonElement>}
            >
              Add an image, gif, or video
            </PlaceholderTrigger>
          }
        />
        <PopoverContent
          className="w-80"
          finalFocus={false}
          initialFocus={false}
        >
          <LinkUploadTabs
            linkPanel={
              <SourceLinkPanel
                key={pickerOpen ? "open" : "closed"}
                onSubmit={handleUrlSubmit}
                placeholder="https://example.com/image.png"
                submitLabel="Insert link"
              />
            }
            uploadPanel={
              <SourceUploadPanel
                isUploading={isUploading}
                onFileSelect={(file) => {
                  handleFileSelect(file).catch(() => undefined);
                }}
                uploadError={uploadError}
              />
            }
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    // Visible focus target: keyboard users see where structural keys apply.
    // The frame hosts its own interactive children (toolbar, resize handles),
    // so a wrapping <button> would be invalid — a focusable group is correct.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
    // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
    <div
      aria-label="Media block"
      className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onKeyDown={handleKeyDown}
      ref={focusRef as React.RefObject<HTMLDivElement>}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block itself is the keyboard target
      tabIndex={0}
    >
      <MediaView
        onWidthChange={(widthPercent) => {
          onChange({ ...props, widthPercent });
        }}
        props={props}
      />
    </div>
  );
}
