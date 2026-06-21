import { Button } from "@/components/ui/button.tsx";

interface StaleBannerProps {
  onAcknowledge: () => void;
  onRevert: () => void;
}

export function StaleBanner({ onAcknowledge, onRevert }: StaleBannerProps) {
  return (
    <>
      <span className="text-muted-foreground text-xs">
        This page changed on the site since you edited it.
      </span>
      <Button onClick={onRevert} size="xs" type="button" variant="secondary">
        Use site version
      </Button>
      <Button
        onClick={onAcknowledge}
        size="xs"
        type="button"
        variant="secondary"
      >
        Keep my edits
      </Button>
    </>
  );
}
