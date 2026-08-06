import { IconPlus, IconX } from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
} from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  ASSET_CLASS_CRYPTO,
  ASSET_CLASS_EQUITY,
  type LiveAssetClass,
  type LiveInstrument,
  MAX_LIVE_MARKET_INSTRUMENTS,
  normalizeInstruments,
} from "@/lib/connectors/live-markets.ts";
import { cn } from "@/lib/utils.ts";

/**
 * One-per-line symbol editor with a Stock / Crypto toggle inside an
 * `InputGroup` end addon. Shared by the synced create form and Settings →
 * Source. Enter on a filled row appends a blank row (no separate Add button).
 */

/** Max instruments — matches the Finnhub proxy's peer cap. */
const MAX_INSTRUMENTS = MAX_LIVE_MARKET_INSTRUMENTS;

/** Matches `InputGroupButton` `icon-xs` so +/- and remove stay aligned. */
const REMOVE_SLOT_CLASS = "size-6 shrink-0";

/**
 * Keep typing/navigation inside the input when the editor is hosted in a
 * dropdown menu (Settings → Source), where the menu would otherwise swallow
 * keys for typeahead. Escape still bubbles so the menu can close.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

export interface InstrumentDraft {
  assetClass: LiveAssetClass;
  /** Stable row key for React lists (not persisted). */
  key: string;
  symbol: string;
}

let draftKeySeq = 0;

function nextDraftKey(): string {
  draftKeySeq += 1;
  return `inst-${draftKeySeq}`;
}

/** Empty trailing row for the create/settings editors. */
export function emptyInstrumentDraft(
  assetClass: LiveAssetClass = ASSET_CLASS_EQUITY
): InstrumentDraft {
  return { key: nextDraftKey(), symbol: "", assetClass };
}

/** Hydrate drafts from persisted instruments. */
export function draftsFromInstruments(
  instruments: readonly LiveInstrument[]
): InstrumentDraft[] {
  if (instruments.length === 0) {
    return [emptyInstrumentDraft()];
  }
  return instruments.map((instrument) => ({
    key: nextDraftKey(),
    symbol: instrument.symbol,
    assetClass: instrument.assetClass,
  }));
}

/**
 * Commit-ready instruments: trim/uppercase, drop empties, dedupe by symbol
 * (first wins), enforce shape + max length.
 */
export function instrumentsFromDrafts(
  drafts: readonly InstrumentDraft[]
): LiveInstrument[] {
  return normalizeInstruments(
    drafts.map(({ symbol, assetClass }) => ({ symbol, assetClass }))
  );
}

function patchDraft(
  drafts: readonly InstrumentDraft[],
  key: string,
  patch: Partial<InstrumentDraft>
): InstrumentDraft[] {
  return drafts.map((draft) =>
    draft.key === key ? { ...draft, ...patch } : draft
  );
}

function AssetClassToggle({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: LiveAssetClass) => void;
  value: LiveAssetClass;
}): ReactNode {
  return (
    <fieldset
      aria-label="Asset class"
      className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted p-0.5"
    >
      {(
        [
          { id: ASSET_CLASS_EQUITY, label: "Stock" },
          { id: ASSET_CLASS_CRYPTO, label: "Crypto" },
        ] as const
      ).map((option) => {
        const selected = value === option.id;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "h-full rounded-[calc(var(--radius)-3px)] px-1.5 text-[11px] leading-none outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            disabled={disabled}
            key={option.id}
            onClick={() => {
              onChange(option.id);
            }}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export interface InstrumentListEditorProps {
  /** When set, the first empty row input receives this ref (create form autofocus). */
  focusRef?: (node: HTMLInputElement | null) => void;
  /** Optional note under the list (create form help, settings errors). */
  hint?: ReactNode;
  /** Stable id for the first row input (FieldLabel htmlFor). */
  id?: string;
  invalid?: boolean;
  /**
   * Fired for every draft edit (typing included). Settings editors that only
   * want to persist on blur/toggle should prefer {@link onCommit}.
   */
  onChange: (drafts: InstrumentDraft[]) => void;
  /**
   * Fired when a row is ready to persist: blur, Enter, Stock/Crypto toggle,
   * add, or remove. Create form can omit this (submit reads drafts).
   */
  onCommit?: (drafts: InstrumentDraft[]) => void;
  values: InstrumentDraft[];
}

/**
 * Editable instrument rows: `InputGroup` with Stock/Crypto toggle in the end
 * addon. Enter on a filled last row appends a blank row and focuses it.
 */
export function InstrumentListEditor({
  focusRef,
  hint,
  id,
  invalid,
  onChange,
  onCommit,
  values,
}: InstrumentListEditorProps): ReactNode {
  const baseId = useId();
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  // Focus by index after layout so Enter lands on a newly-added blank row.
  const pendingFocusIndexRef = useRef<number | null>(null);
  // Inline ref callbacks re-attach on every render, so the host's mount-focus
  // ref must fire once — otherwise every keystroke yanks focus to row one.
  const autoFocusDoneRef = useRef(false);

  useLayoutEffect(() => {
    const index = pendingFocusIndexRef.current;
    if (index === null) {
      return;
    }
    pendingFocusIndexRef.current = null;
    const target = values[index] ?? values.at(-1);
    if (!target) {
      return;
    }
    inputRefs.current.get(target.key)?.focus();
  }, [values]);

  const publish = (next: InstrumentDraft[], commit: boolean) => {
    onChange(next);
    if (commit) {
      onCommit?.(next);
    }
  };

  const updateRow = (
    key: string,
    patch: Partial<InstrumentDraft>,
    commit: boolean
  ) => {
    publish(patchDraft(values, key, patch), commit);
  };

  const removeRow = (key: string) => {
    if (values.length <= 1) {
      publish([emptyInstrumentDraft(values[0]?.assetClass)], true);
      return;
    }
    publish(
      values.filter((row) => row.key !== key),
      true
    );
  };

  const requestFocusAt = (index: number) => {
    pendingFocusIndexRef.current = index;
  };

  const appendBlankAndFocus = (
    drafts: InstrumentDraft[],
    assetClass: LiveAssetClass
  ) => {
    if (drafts.length >= MAX_INSTRUMENTS) {
      return;
    }
    const blank = emptyInstrumentDraft(assetClass);
    requestFocusAt(drafts.length);
    publish([...drafts, blank], true);
  };

  /** Same as Enter on a filled row: commit, then focus next / append a blank. */
  const confirmRow = (row: InstrumentDraft, index: number, symbol: string) => {
    if (symbol.trim() === "") {
      return;
    }
    const next = patchDraft(values, row.key, { symbol });
    if (index === next.length - 1) {
      appendBlankAndFocus(next, row.assetClass);
      return;
    }
    publish(next, true);
    requestFocusAt(index + 1);
    const nextRow = values[index + 1];
    if (nextRow) {
      inputRefs.current.get(nextRow.key)?.focus();
      pendingFocusIndexRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {values.map((row, index) => {
        const inputId = index === 0 && id ? id : `${baseId}-${row.key}`;
        const isLast = index === values.length - 1;
        return (
          <InputGroup key={row.key}>
            <InputGroupInput
              aria-invalid={invalid ? true : undefined}
              autoComplete="off"
              className="min-w-0 font-normal uppercase tabular-nums"
              id={inputId}
              onBlur={(event) => {
                publish(
                  patchDraft(values, row.key, {
                    symbol: event.currentTarget.value,
                  }),
                  true
                );
              }}
              onChange={(event) => {
                updateRow(row.key, { symbol: event.target.value }, false);
              }}
              onKeyDown={(event) => {
                stopMenuKeys(event);
                if (
                  event.key === "Backspace" &&
                  event.currentTarget.value === ""
                ) {
                  if (values.length <= 1) {
                    return;
                  }
                  event.preventDefault();
                  requestFocusAt(Math.max(0, index - 1));
                  removeRow(row.key);
                  return;
                }
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                confirmRow(row, index, event.currentTarget.value);
              }}
              placeholder="Ticker"
              ref={(node) => {
                if (node) {
                  inputRefs.current.set(row.key, node);
                } else {
                  inputRefs.current.delete(row.key);
                }
                if (index === 0 && node && !autoFocusDoneRef.current) {
                  autoFocusDoneRef.current = true;
                  focusRef?.(node);
                }
              }}
              spellCheck={false}
              value={row.symbol}
            />
            <InputGroupAddon align="inline-end" className="gap-1">
              <AssetClassToggle
                onChange={(assetClass) => {
                  updateRow(row.key, { assetClass }, true);
                }}
                value={row.assetClass}
              />
              {isLast ? (
                <InputGroupButton
                  aria-label="Add symbol"
                  className={REMOVE_SLOT_CLASS}
                  disabled={
                    row.symbol.trim() === "" || values.length >= MAX_INSTRUMENTS
                  }
                  onClick={() => {
                    const input = inputRefs.current.get(row.key);
                    confirmRow(row, index, input?.value ?? row.symbol);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <IconPlus />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  aria-label={`Remove ${row.symbol || "symbol"}`}
                  className={REMOVE_SLOT_CLASS}
                  onClick={() => {
                    removeRow(row.key);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <IconX />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        );
      })}
      {hint}
    </div>
  );
}
