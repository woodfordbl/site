"use client";

import { IconDeviceFloppy, IconDots, IconRefresh } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";

import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import {
  type PageCanvasFooterActionsInput,
  usePageCanvasFooterActions,
} from "@/hooks/use-page-canvas-footer-actions.ts";
import { cn } from "@/lib/utils.ts";

interface PageCanvasActionsDrawerProps extends PageCanvasFooterActionsInput {
  triggerHost: HTMLElement | null;
}

function DrawerRow({
  destructive,
  icon,
  label,
  onClick,
}: {
  destructive?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] transition-colors active:bg-accent",
        destructive ? "text-destructive" : "text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {icon ? (
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center [&_svg]:size-5",
            destructive ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </div>
  );
}

export function PageCanvasActionsDrawer({
  triggerHost,
  ...props
}: PageCanvasActionsDrawerProps) {
  const isNarrowViewport = useIsNarrowViewport();
  const [open, setOpen] = useState(false);
  const {
    confirmAction,
    handleConfirm,
    hasLocalChanges,
    hasUpdates,
    isDev,
    saveStatus,
    setConfirmAction,
    visible,
  } = usePageCanvasFooterActions(props);

  if (!(isNarrowViewport && visible && triggerHost)) {
    return null;
  }

  const closeDrawer = () => {
    setOpen(false);
  };

  const trigger = (
    <Button
      aria-label="Page actions"
      className="shrink-0 text-muted-foreground"
      onClick={() => setOpen(true)}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <IconDots aria-hidden />
    </Button>
  );

  return (
    <>
      {createPortal(trigger, triggerHost)}
      <Drawer onOpenChange={setOpen} open={open}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Page actions</DrawerTitle>
            {saveStatus ? (
              <DrawerDescription>{saveStatus}</DrawerDescription>
            ) : null}
          </DrawerHeader>
          <div className="flex flex-col px-2 pb-4">
            {hasUpdates ? (
              <>
                <SectionLabel>Site update</SectionLabel>
                <p className="px-3 pb-2 text-muted-foreground text-sm">
                  New content was published on the site.
                </p>
                <DrawerRow
                  icon={<IconRefresh />}
                  label="Refresh site content"
                  onClick={() => {
                    closeDrawer();
                    setConfirmAction("refresh");
                  }}
                />
              </>
            ) : null}
            {isDev ? (
              <>
                {hasUpdates ? <SectionLabel>Author</SectionLabel> : null}
                <DrawerRow
                  icon={<IconDeviceFloppy />}
                  label="Save all"
                  onClick={() => {
                    closeDrawer();
                    setConfirmAction("saveAll");
                  }}
                />
              </>
            ) : null}
            {hasLocalChanges ? (
              <>
                {hasUpdates || isDev ? (
                  <SectionLabel>Local changes</SectionLabel>
                ) : null}
                <DrawerRow
                  icon={<IconRefresh />}
                  label="Reset page"
                  onClick={() => {
                    closeDrawer();
                    setConfirmAction("reset");
                  }}
                />
                <DrawerRow
                  destructive
                  icon={<IconRefresh />}
                  label="Reset all"
                  onClick={() => {
                    closeDrawer();
                    setConfirmAction("resetAll");
                  }}
                />
              </>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
      <PageCanvasConfirmDialog
        confirmAction={confirmAction}
        onConfirm={handleConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setConfirmAction(null);
          }
        }}
      />
    </>
  );
}
