interface SlashMenuItemLabelProps {
  hint?: string;
  hintClassName?: string;
  label: string;
}

export function SlashMenuItemLabel({
  label,
  hint,
  hintClassName = "ml-auto text-muted-foreground tabular-nums",
}: SlashMenuItemLabelProps) {
  return (
    <>
      <span className="min-w-0 flex-1">{label}</span>
      {hint ? <span className={hintClassName}>{hint}</span> : null}
    </>
  );
}
