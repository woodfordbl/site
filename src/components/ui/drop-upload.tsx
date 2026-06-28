import { IconUpload } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils.ts";

export interface DropUploadProps {
  /** Standard input `accept` string; also gates drag-and-drop rejections. */
  accept?: string;
  busy?: boolean;
  /** Shown while `busy`. Falls back to `${label}…`. */
  busyLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Secondary hint under the label (hidden while busy). */
  hint?: string;
  /** Replaces the default upload icon. */
  icon?: ReactNode;
  label?: string;
  /** Allow selecting / dropping more than one file. */
  multiple?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  /** Fired when a file dropped or dragged file fails the `accept` filter. */
  onReject?: (message: string) => void;
}

/**
 * Generic drag-and-drop + click-to-pick file surface. The single shared
 * primitive behind every content upload in the app (media blocks, page covers,
 * workspace import). Validation and side effects belong to the caller; this
 * only collects files and enforces the optional `accept` filter on drop.
 */
export function DropUpload({
  accept,
  busy = false,
  busyLabel,
  className,
  disabled = false,
  hint = "or drag and drop",
  icon,
  label = "Choose file",
  multiple = false,
  onFiles,
  onReject,
}: DropUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const emit = (fileList: FileList | null | undefined) => {
    if (!fileList || fileList.length === 0) {
      return;
    }
    const all = Array.from(fileList);
    const files = multiple ? all : all.slice(0, 1);

    const accepted = files.filter((file) => fileMatchesAccept(file, accept));
    if (accepted.length < files.length) {
      onReject?.(
        accept
          ? `Unsupported file type. Expected ${accept}.`
          : "Unsupported file type."
      );
    }
    if (accepted.length > 0) {
      onFiles(accepted);
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    emit(event.dataTransfer.files);
  };

  return (
    <button
      className={cn(
        "flex min-h-[4.5rem] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center transition-colors disabled:pointer-events-none disabled:opacity-50",
        isDraggingOver
          ? "border-primary bg-accent/40"
          : "border-border bg-muted/30 hover:bg-muted/50",
        className
      )}
      data-slot="drop-upload"
      disabled={disabled || busy}
      onClick={() => inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      type="button"
    >
      <input
        accept={accept}
        className="hidden"
        multiple={multiple}
        onChange={(event) => {
          emit(event.target.files);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5">
        {icon ?? <IconUpload />}
      </span>
      <span className="flex flex-col gap-0">
        <span className="font-medium text-foreground text-sm leading-tight">
          {busy ? (busyLabel ?? `${label}…`) : label}
        </span>
        {busy ? null : (
          <span className="text-muted-foreground text-xs leading-tight">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/** Mirrors the browser's `accept` semantics: extensions, `type/*`, exact MIME. */
export function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept) {
    return true;
  }

  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }

  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith(".")) {
      return fileName.endsWith(token);
    }
    if (token.endsWith("/*")) {
      return fileType.startsWith(`${token.slice(0, -1)}`);
    }
    return fileType === token;
  });
}
