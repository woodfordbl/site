"use client";

import {
  IconCamera,
  IconTrash,
  IconUpload,
  IconWorld,
} from "@tabler/icons-react";
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
import type { PageHeaderImage } from "@/lib/schemas/page-settings.ts";
import { parseValidatedUrlInput } from "@/lib/schemas/url-input.ts";

interface PageCoverDialogProps {
  headerImage: PageHeaderImage | undefined;
  onChange: (headerImage: PageHeaderImage | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Cover picker dialog: choose a page cover from Unsplash search, a URL, or an
 * upload, and remove an existing one. Uploads become content-addressed IndexedDB
 * assets (`putAsset`); URLs and Unsplash photos are stored as hotlinks
 * (`source: "url"`) — Unsplash images are never re-hosted. Repositioning lives on
 * the cover itself (drag), not here.
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {headerImage ? "Change cover" : "Add cover"}
          </DialogTitle>
          <DialogDescription>
            Search Unsplash, paste a link, or upload an image. Drag the cover to
            reposition it.
          </DialogDescription>
        </DialogHeader>

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
            <PageCoverUnsplashPanel active={open} onSelect={apply} />
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

        {headerImage ? (
          <div className="flex justify-end border-border border-t pt-3">
            <Button
              onClick={() => apply(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <IconTrash />
              Remove cover
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
