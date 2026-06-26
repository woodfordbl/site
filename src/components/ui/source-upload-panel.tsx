import { IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils.ts";

interface SourceUploadPanelProps {
  accept?: string;
  chooseFileLabel?: string;
  className?: string;
  dropHintLabel?: string;
  isUploading?: boolean;
  onFileSelect: (file: File) => void | Promise<void>;
  uploadError?: string | null;
}

function SourceUploadPanel({
  accept = "image/*,video/*",
  onFileSelect,
  isUploading = false,
  uploadError,
  chooseFileLabel = "Choose file",
  dropHintLabel = "or drag and drop",
  className,
}: SourceUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (file) {
      onFileSelect(file);
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
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="source-upload-panel"
    >
      <input
        accept={accept}
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
      <button
        className={cn(
          "flex min-h-[4.5rem] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-3 text-center transition-colors disabled:pointer-events-none disabled:opacity-50",
          isDraggingOver
            ? "border-primary bg-accent/40"
            : "border-border bg-muted/30 hover:bg-muted/50"
        )}
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        type="button"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5">
          <IconUpload />
        </span>
        <span className="flex flex-col gap-0">
          <span className="font-medium text-foreground text-sm leading-tight">
            {isUploading ? "Uploading…" : chooseFileLabel}
          </span>
          {isUploading ? null : (
            <span className="text-muted-foreground text-xs leading-tight">
              {dropHintLabel}
            </span>
          )}
        </span>
      </button>
      {uploadError ? (
        <p className="text-destructive text-sm">{uploadError}</p>
      ) : null}
    </div>
  );
}

export { SourceUploadPanel };
