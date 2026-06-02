import { Button } from "@/components/ui/button.tsx";

interface StaleBannerProps {
  onAcknowledge: () => void;
  onRevert: () => void;
}

export function StaleBanner({ onAcknowledge, onRevert }: StaleBannerProps) {
  return (
    <>
      <Button onClick={onRevert} size="sm" type="button" variant="secondary">
        Revert
      </Button>
      <Button
        onClick={onAcknowledge}
        size="sm"
        type="button"
        variant="secondary"
      >
        Keep
      </Button>
    </>
  );
}
