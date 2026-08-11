import { type ReactNode, useState } from "react";

import {
  draftsFromInstruments,
  emptyInstrumentDraft,
  type InstrumentDraft,
  InstrumentListEditor,
  instrumentsFromDrafts,
} from "@/components/database/instrument-list-editor.tsx";
import { updateDatabaseSource } from "@/db/queries/database-collection-ops.ts";
import { parseLiveInstruments } from "@/lib/connectors/live-markets.ts";
import type { ConnectorConfigField } from "@/lib/connectors/types.ts";
import type { JsonValue } from "@/lib/schemas/database.ts";

interface InstrumentListConfigEditorProps {
  config: Record<string, JsonValue>;
  databaseId: string;
  field: ConnectorConfigField;
}

/** Persisted editor for an instrument-list connector config field. */
export function InstrumentListConfigEditor({
  config,
  databaseId,
  field,
}: InstrumentListConfigEditorProps): ReactNode {
  const instruments = parseLiveInstruments(config[field.key]);
  const [drafts, setDrafts] = useState<InstrumentDraft[]>(() =>
    draftsFromInstruments(instruments)
  );
  const [error, setError] = useState("");

  const commit = (next: InstrumentDraft[]) => {
    const nextInstruments = instrumentsFromDrafts(next);
    if (nextInstruments.length === 0) {
      setError("Keep at least one");
      setDrafts(next.length > 0 ? next : [emptyInstrumentDraft()]);
      return;
    }
    setError("");
    setDrafts(next);
    if (JSON.stringify(instruments) !== JSON.stringify(nextInstruments)) {
      updateDatabaseSource(databaseId, {
        config: { ...config, [field.key]: nextInstruments },
      });
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground text-xs">{field.label}</span>
      <InstrumentListEditor
        hint={
          error ? <p className="text-destructive text-xs">{error}</p> : null
        }
        onChange={setDrafts}
        onCommit={commit}
        values={drafts}
      />
    </div>
  );
}
