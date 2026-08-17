"use client";

import { IconFileText, IconPencil } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

/**
 * @fileoverview The choice a reader makes the first time they try to edit a
 * row page that is still rendering the database's shared template.
 *
 * Two ways to want this, and they lead opposite ways. Editing *this* row's
 * page means giving it a body of its own — a copy of the template, stored
 * separately from then on, which is why the cost is stated rather than
 * implied. Editing every row's page means editing the template, which is a
 * different page entirely; offering it here is what keeps someone from
 * customizing fourteen rows one at a time to make the same change.
 */

export interface CustomizeRowPageDialogProps {
  /** Named so the dialog says which template is about to be left behind. */
  databaseName: string;
  /** False when the database has no template — nothing is being left behind. */
  hasTemplate: boolean;
  onCustomize: () => void;
  onEditTemplate?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CustomizeRowPageDialog({
  databaseName,
  hasTemplate,
  onEditTemplate,
  onOpenChange,
  onCustomize,
  open,
}: CustomizeRowPageDialogProps): ReactNode {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give this row a page of its own?</DialogTitle>
          <DialogDescription>
            {hasTemplate
              ? `This page renders the ${databaseName} template, so every change to the template reaches it. Editing copies the template once and stops following it — later template changes will skip this row until you reset it. Each customized row is stored as its own page, so a database with many of them gets heavier to load.`
              : `Rows in ${databaseName} share one body, so nothing is stored for this page yet. Editing gives this row a page of its own, stored separately — a database with many of them gets heavier to load. Editing the template instead changes every row at once.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          {onEditTemplate ? (
            <Button onClick={onEditTemplate} variant="ghost">
              <IconFileText />
              {hasTemplate ? "Edit template instead" : "Create a template"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={onCustomize}>
              <IconPencil />
              Edit this page
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
