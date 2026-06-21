import { IconX } from "@tabler/icons-react";
import { MediaVideoPlayer } from "@/components/blocks/types/media/media-video-player.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { NaturalMediaSize } from "@/lib/dom/object-contain-bounds.ts";
import type { MediaKind } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

const mediaClassName =
  "max-h-[calc(100vh-4rem)] max-w-full rounded-md object-contain";

interface MediaLightboxProps {
  alt: string;
  displayUrl: string;
  kind: MediaKind;
  /** Natural pixel size measured by the frame; sizes the img to avoid layout shift. */
  naturalSize?: NaturalMediaSize | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function MediaLightbox({
  alt,
  displayUrl,
  kind,
  naturalSize,
  onOpenChange,
  open,
}: MediaLightboxProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[calc(100vw-4rem)]"
        )}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div className="relative w-fit max-w-full">
          {kind === "video" ? (
            <MediaVideoPlayer className={mediaClassName} src={displayUrl} />
          ) : (
            <img
              alt={alt}
              className={mediaClassName}
              height={naturalSize?.height}
              src={displayUrl}
              width={naturalSize?.width}
            />
          )}
          <DialogClose
            render={
              <Button
                className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70 hover:text-white"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <IconX />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
