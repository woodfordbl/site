import { DropUpload } from "@/components/ui/drop-upload.tsx";
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
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="source-upload-panel"
    >
      <DropUpload
        accept={accept}
        busy={isUploading}
        busyLabel="Uploading…"
        hint={dropHintLabel}
        label={chooseFileLabel}
        onFiles={(files) => {
          const file = files[0];
          if (file) {
            onFileSelect(file);
          }
        }}
      />
      {uploadError ? (
        <p className="text-destructive text-sm">{uploadError}</p>
      ) : null}
    </div>
  );
}

export { SourceUploadPanel };
