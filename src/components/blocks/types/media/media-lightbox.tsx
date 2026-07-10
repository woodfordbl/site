import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { IconX } from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
import { useRef } from "react";
import { MediaVideoPlayer } from "@/components/blocks/types/media/media-video-player.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DialogClose,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { NaturalMediaSize } from "@/lib/dom/object-contain-bounds.ts";
import type { MediaKind } from "@/lib/schemas/block-props.ts";

/** Shared by the inline frame and the lightbox so open/close morphs match. */
export const mediaMorphTransition = {
  type: "spring",
  stiffness: 380,
  damping: 34,
} as const;

/**
 * Chrome (close button) enters only after the morph has visually settled —
 * the spring above covers most of its travel by ~250ms — and leaves
 * instantly on close so nothing floats over the return morph.
 */
const chromeEnterTransition = { delay: 0.25, duration: 0.15 } as const;
const chromeExitTransition = { delay: 0, duration: 0.1 } as const;

const mediaClassName =
  "max-h-[calc(100vh-4rem)] max-w-full rounded-md object-contain";

interface MediaLightboxProps {
  alt: string;
  displayUrl: string;
  kind: MediaKind;
  /** Shared-element id linking the inline image to the lightbox image. */
  layoutId?: string;
  /** Natural pixel size measured by the frame; sizes the img to avoid layout shift. */
  naturalSize?: NaturalMediaSize | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function MediaLightbox({
  alt,
  displayUrl,
  kind,
  layoutId,
  naturalSize,
  onOpenChange,
  open,
}: MediaLightboxProps) {
  const actionsRef = useRef<BaseDialog.Root.Actions>(null);

  return (
    <BaseDialog.Root
      actionsRef={actionsRef}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen) {
          // Base UI hides the popup as soon as it unmounts; defer that until
          // the motion exit morph finishes (see onExitComplete below).
          eventDetails.preventUnmountOnClose();
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogPortal>
        <AnimatePresence onExitComplete={() => actionsRef.current?.unmount()}>
          {open ? (
            <>
              <BaseDialog.Backdrop
                render={
                  <m.div
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 isolate z-50 bg-black/20"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                  />
                }
              />
              <BaseDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 items-center justify-center outline-none sm:max-w-[calc(100vw-4rem)]">
                <DialogTitle className="sr-only">{alt}</DialogTitle>
                <div className="relative w-fit max-w-full">
                  {kind === "video" ? (
                    <m.div
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      initial={{ opacity: 0, scale: 0.97 }}
                      transition={mediaMorphTransition}
                    >
                      <MediaVideoPlayer
                        className={mediaClassName}
                        src={displayUrl}
                      />
                    </m.div>
                  ) : (
                    <m.img
                      alt={alt}
                      className={mediaClassName}
                      height={naturalSize?.height}
                      layoutId={layoutId}
                      src={displayUrl}
                      transition={mediaMorphTransition}
                      width={naturalSize?.width}
                    />
                  )}
                  <m.div
                    animate={{ opacity: 1 }}
                    className="absolute top-2 right-2"
                    exit={{ opacity: 0, transition: chromeExitTransition }}
                    initial={{ opacity: 0 }}
                    transition={chromeEnterTransition}
                  >
                    <DialogClose
                      render={
                        <Button
                          className="bg-black/50 text-white hover:bg-black/70 hover:text-white"
                          size="icon-sm"
                          variant="ghost"
                        />
                      }
                    >
                      <IconX />
                      <span className="sr-only">Close</span>
                    </DialogClose>
                  </m.div>
                </div>
              </BaseDialog.Popup>
            </>
          ) : null}
        </AnimatePresence>
      </DialogPortal>
    </BaseDialog.Root>
  );
}
