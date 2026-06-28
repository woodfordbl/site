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
import {
  DrawerMenuRow,
  DrawerMenuSectionLabel as SectionLabel,
} from "@/components/ui/menu-presentation.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import {
  type PageCanvasFooterActionsInput,
  usePageCanvasFooterActions,
} from "@/hooks/use-page-canvas-footer-actions.ts";

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
    <DrawerMenuRow destructive={destructive} onClick={onClick}>
      {icon}
      <span className="flex-1 truncate">{label}</span>
    </DrawerMenuRow>
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
    isTemplatePage,
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
            {hasLocalChanges && !isTemplatePage ? (
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
