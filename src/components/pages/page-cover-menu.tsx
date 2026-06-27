"use client";

import { IconCamera, IconUpload, IconWorld } from "@tabler/icons-react";
import { useState } from "react";

import { PageCoverUnsplashPanel } from "@/components/pages/page-cover-unsplash-panel.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { SourceLinkPanel } from "@/components/ui/source-link-panel.tsx";
import { SourceUploadPanel } from "@/components/ui/source-upload-panel.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { putAsset } from "@/db/assets/asset-store.ts";
import {
  resolveMediaDisplayUrl,
  useAssetObjectUrl,
} from "@/hooks/use-asset-object-url.ts";
import {
  DEFAULT_HEADER_FOCAL_Y,
  type PageHeaderImage,
} from "@/lib/schemas/page-settings.ts";
import { parseValidatedUrlInput } from "@/lib/schemas/url-input.ts";

interface PageCoverDialogProps {
  headerImage: PageHeaderImage | undefined;
  onChange: (headerImage: PageHeaderImage | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** Live preview + vertical focal-point control for an existing cover. */
function CoverReposition({
  headerImage,
  onChange,
}: {
  headerImage: PageHeaderImage;
  onChange: (headerImage: PageHeaderImage | null) => void;
}) {
  const assetObjectUrl = useAssetObjectUrl(
    headerImage.source === "asset" ? headerImage.src : undefined
  );
  const displayUrl = resolveMediaDisplayUrl(
    headerImage.source,
    headerImage.src,
    assetObjectUrl
  );
  const focalY = headerImage.focalY ?? DEFAULT_HEADER_FOCAL_Y;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-28 w-full overflow-hidden rounded-lg bg-muted">
        {displayUrl ? (
          <img
            alt={headerImage.alt ?? ""}
            className="h-full w-full object-cover"
            height={160}
            src={displayUrl}
            style={{ objectPosition: `50% ${focalY}%` }}
            width={640}
          />
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-muted-foreground text-xs">
        Reposition
        <input
          aria-label="Vertical focal point"
          className="h-1.5 flex-1 cursor-ns-resize accent-primary"
          max={100}
          min={0}
          onChange={(rangeEvent) => {
            onChange({
              ...headerImage,
              focalY: Number(rangeEvent.target.value),
            });
          }}
          type="range"
          value={focalY}
        />
      </label>
      <Button
        className="self-start"
        onClick={() => onChange(null)}
        size="sm"
        type="button"
        variant="outline"
      >
        Remove cover
      </Button>
    </div>
  );
}

/**
 * Cover picker dialog: choose a page cover from an upload, a URL, or Unsplash
 * search; reposition or remove an existing one. Uploads become content-addressed
 * IndexedDB assets (`putAsset`); URLs and Unsplash photos are stored as
 * hotlinks (`source: "url"`) — Unsplash images are never re-hosted.
 */
export function PageCoverDialog({
  headerImage,
  onChange,
  onOpenChange,
  open,
}: PageCoverDialogProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const apply = (next: PageHeaderImage | null) => {
    onChange(next);
    onOpenChange(false);
  };

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const { assetId } = await putAsset(file);
      apply({
        source: "asset",
        src: assetId,
        alt: headerImage?.alt,
        focalY: headerImage?.focalY,
      });
    } catch (uploadException) {
      setUploadError(
        uploadException instanceof Error
          ? uploadException.message
          : "Upload failed"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = (url: string) => {
    const normalized = parseValidatedUrlInput(url);
    if (!normalized) {
      return;
    }
    apply({
      source: "url",
      src: normalized,
      focalY: headerImage?.focalY,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{headerImage ? "Page cover" : "Add cover"}</DialogTitle>
          <DialogDescription>
            Upload an image, paste a link, or search Unsplash.
          </DialogDescription>
        </DialogHeader>

        {headerImage ? (
          <CoverReposition headerImage={headerImage} onChange={apply} />
        ) : null}

        <Tabs className="gap-0" defaultValue="unsplash">
          <div className="relative w-full">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 z-0 border-border border-b"
            />
            <TabsList className="relative z-[1]" variant="line">
              <TabsTrigger value="unsplash">
                <IconCamera />
                Unsplash
              </TabsTrigger>
              <TabsTrigger value="link">
                <IconWorld />
                Link
              </TabsTrigger>
              <TabsTrigger value="upload">
                <IconUpload />
                Upload
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent className="mt-3" value="unsplash">
            <PageCoverUnsplashPanel onSelect={apply} />
          </TabsContent>
          <TabsContent className="mt-3" value="link">
            <SourceLinkPanel
              key={open ? "open" : "closed"}
              onSubmit={handleUrlSubmit}
              placeholder="https://example.com/cover.jpg"
              submitLabel="Use image"
            />
          </TabsContent>
          <TabsContent className="mt-3" value="upload">
            <SourceUploadPanel
              accept="image/*"
              isUploading={isUploading}
              onFileSelect={(file) => {
                handleFileSelect(file).catch(() => undefined);
              }}
              uploadError={uploadError}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
