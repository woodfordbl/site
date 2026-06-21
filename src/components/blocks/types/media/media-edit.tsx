import { IconPhoto, IconUpload, IconWorld } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

import { MediaView } from "@/components/blocks/types/media/media-view.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { putAsset } from "@/db/assets/asset-store.ts";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import {
  inferMediaKindFromMime,
  inferMediaKindFromUrl,
} from "@/lib/media/infer-media-kind.ts";

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
  const [urlDraft, setUrlDraft] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

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

  const handleUrlSubmit = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) {
      return;
    }
    onChange({
      kind: inferMediaKindFromUrl(trimmed),
      source: "url",
      src: trimmed,
      alt: props.alt,
    });
    setUrlDraft("");
    setPickerOpen(false);
  };

  if (!hasMedia) {
    return (
      <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
        <PopoverTrigger
          render={
            <Button
              className="w-full justify-start px-1 font-normal text-base focus-visible:border-none focus-visible:ring-0"
              onKeyDown={handleKeyDown}
              ref={focusRef as React.RefObject<HTMLButtonElement>}
              size="lg"
              type="button"
              variant="ghost"
            >
              <IconPhoto />
              Add image, gif, or video
            </Button>
          }
        />
        <PopoverContent align="start" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Insert media</PopoverTitle>
          </PopoverHeader>
          <Tabs defaultValue="upload">
            <TabsList className="w-full">
              <TabsTrigger value="upload">
                <IconUpload />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url">
                <IconWorld />
                Link
              </TabsTrigger>
            </TabsList>
            <TabsContent className="mt-3 space-y-2" value="upload">
              <input
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => {
                  handleFileChange(event).catch(() => undefined);
                }}
                ref={fileInputRef}
                type="file"
              />
              <Button
                className="w-full"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                {isUploading ? "Uploading…" : "Choose file"}
              </Button>
              {uploadError ? (
                <p className="text-destructive text-sm">{uploadError}</p>
              ) : null}
            </TabsContent>
            <TabsContent className="mt-3 space-y-2" value="url">
              <Input
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleUrlSubmit();
                  }
                }}
                placeholder="https://example.com/image.png"
                value={urlDraft}
              />
              <Button
                className="w-full"
                disabled={!urlDraft.trim()}
                onClick={handleUrlSubmit}
                type="button"
              >
                Insert link
              </Button>
            </TabsContent>
          </Tabs>
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
