import { useCallback, useState } from "react";

import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";

export type SlashPhase = "root" | "link";

export function useSlashState() {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashCaret, setSlashCaret] = useState<FieldSelection>({
    start: 0,
    end: 0,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashPhase, setSlashPhase] = useState<SlashPhase>("root");
  const [linkSubOpen, setLinkSubOpen] = useState(false);

  const handleSlash = useCallback((query: string, caret: FieldSelection) => {
    setSlashQuery((previousQuery) => {
      if (previousQuery !== query) {
        setSelectedIndex(0);
        setSlashPhase("root");
        setLinkSubOpen(false);
      }
      return query;
    });
    setSlashCaret(caret);
    setSlashOpen(true);
  }, []);

  const closeSlash = useCallback(() => {
    setSlashOpen(false);
    setSlashQuery("");
    setSelectedIndex(0);
    setSlashPhase("root");
    setLinkSubOpen(false);
  }, []);

  const moveSelection = useCallback(
    (direction: "up" | "down", itemCount: number) => {
      if (itemCount === 0) {
        return;
      }
      setSelectedIndex((current) => {
        if (direction === "down") {
          return Math.min(current + 1, itemCount - 1);
        }
        return Math.max(current - 1, 0);
      });
    },
    []
  );

  return {
    slashOpen,
    slashQuery,
    slashCaret,
    selectedIndex,
    slashPhase,
    linkSubOpen,
    handleSlash,
    closeSlash,
    moveSelection,
    setSlashOpen,
    setSlashPhase,
    setLinkSubOpen,
  };
}
