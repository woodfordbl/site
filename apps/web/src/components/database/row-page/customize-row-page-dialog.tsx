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
 * page gives it a body of its own that stops following the template; editing
 * every row's page means editing the template, which is a different page
 * entirely. Offering the second here is what keeps someone from customizing
 * fourteen rows one at a time to make the same change.
 *
 * One sentence and two buttons. A reader who clicked into the body has
 * already decided to type; the dialog's whole job is to ask which page they
 * mean, and the one consequence that changes what they get — the copy stops
 * following the template — is the only one stated. Storage weight and the
 * reset path are recoverable and belong where they can be acted on
 * (`row-page/reset-row-page.tsx`), not in front of a caret. Backing out is the X, Esc
 * and the backdrop, so the second button stays the alternative route rather
 * than a third way to say no.
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
              ? `It follows the ${databaseName} template today; its own copy stops updating when the template changes.`
              : `Every row in ${databaseName} shares one body; this one would get a page of its own.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {onEditTemplate ? (
            <Button onClick={onEditTemplate} variant="outline">
              <IconFileText />
              {hasTemplate ? "Edit template" : "Create a template"}
            </Button>
          ) : (
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
          )}
          <Button onClick={onCustomize}>
            <IconPencil />
            Edit this page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
