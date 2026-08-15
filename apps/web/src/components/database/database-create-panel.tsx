import {
  IconChevronLeft,
  IconLink,
  IconRefresh,
  IconTable,
} from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { type ReactNode, useMemo, useState } from "react";

import { ConnectorIcon } from "@/components/database/connector-icon.tsx";
import { DatabaseLinkPicker } from "@/components/database/database-link-picker.tsx";
import {
  emptyInstrumentDraft,
  type InstrumentDraft,
  InstrumentListEditor,
  instrumentsFromDrafts,
} from "@/components/database/instrument-list-editor.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { createDatabaseWithDefaults } from "@/db/queries/database-collection-ops.ts";
import { requestImmediateSync } from "@/db/sync/database-sync-engine.ts";
import { buildSyncedDatabaseSeed } from "@/lib/connectors/build-synced-database.ts";
import { listConnectors } from "@/lib/connectors/registry.ts";
import {
  getConnectorToken,
  setConnectorToken,
} from "@/lib/connectors/token-store.ts";
import type {
  ConnectorAuthSpec,
  ConnectorConfigField,
  ConnectorConfigOption,
  ConnectorDefinition,
} from "@/lib/connectors/types.ts";
import { createDefaultDatabaseSeed } from "@/lib/databases/database-defaults.ts";

/**
 * Popover panel behind an unlinked database block's placeholder trigger
 * (media/embed source-picker conventions): **New** (default local seed),
 * **Linked** (existing workspace database — search picker), and **Synced**
 * (connector cards whose pick opens a config form generated from the
 * connector's `configFields`). Submit validates via the connector's zod
 * `configSchema` (inline errors per the url-input conventions), stores any
 * auth token client-side only, then builds + inserts the synced seed.
 */

type ConfigDraftValue = string | InstrumentDraft[];

/**
 * Raw config from form drafts: instrument inputs contribute typed rows,
 * selects use their default, and empty text inputs are omitted for Zod defaults.
 */
function buildRawConfig(
  configFields: readonly ConnectorConfigField[],
  drafts: Record<string, ConfigDraftValue>
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of configFields) {
    const draft = drafts[field.key] ?? "";
    if (field.kind === "instrumentList") {
      config[field.key] = instrumentsFromDrafts(
        Array.isArray(draft) ? draft : []
      );
      continue;
    }
    const raw = typeof draft === "string" ? draft.trim() : "";
    if (field.kind === "select") {
      config[field.key] = raw || field.defaultValue;
      continue;
    }
    if (raw !== "") {
      config[field.key] = raw;
    }
  }
  return config;
}

/** Trigger + popup for a `"select"` config field, styled like the inputs. */
function ConnectorSelectControl({
  id,
  invalid,
  onValueChange,
  options,
  value,
}: {
  id: string;
  invalid: boolean;
  onValueChange: (value: string) => void;
  options: ConnectorConfigOption[];
  value: string;
}): ReactNode {
  return (
    <Select
      onValueChange={(next) => {
        onValueChange(typeof next === "string" ? next : "");
      }}
      value={value}
    >
      <SelectTrigger aria-invalid={invalid ? true : undefined} id={id}>
        <SelectValue>
          {(current) =>
            options.find((option) => option.value === current)?.label ??
            String(current ?? "")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One config field's control — select, instrument rows, or plain text. */
function ConnectorConfigControl({
  configField,
  error,
  focusRef,
  name,
  onBlur,
  onChange,
  value,
}: {
  configField: ConnectorConfigField;
  error: boolean;
  focusRef?: (node: HTMLInputElement | null) => void;
  name: string;
  onBlur?: () => void;
  onChange: (value: ConfigDraftValue) => void;
  value: ConfigDraftValue;
}): ReactNode {
  if (configField.kind === "select") {
    const selectValue = typeof value === "string" ? value : "";
    return (
      <ConnectorSelectControl
        id={`connector-${configField.key}`}
        invalid={error}
        onValueChange={onChange}
        options={configField.options ?? []}
        value={selectValue}
      />
    );
  }
  if (configField.kind === "instrumentList") {
    return (
      <InstrumentListEditor
        focusRef={focusRef}
        id={`connector-${configField.key}`}
        invalid={error}
        onChange={onChange}
        values={Array.isArray(value) ? value : [emptyInstrumentDraft()]}
      />
    );
  }
  const inputValue = typeof value === "string" ? value : "";
  return (
    <Input
      aria-invalid={error ? true : undefined}
      autoComplete="off"
      id={`connector-${configField.key}`}
      name={name}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      placeholder={configField.placeholder}
      ref={focusRef}
      value={inputValue}
    />
  );
}

/**
 * Whether the connector's auth token input applies to the current draft. A
 * connector with a `type` selector only needs its token for the `stocks`
 * type (crypto is keyless); connectors without a `type` field always show it.
 */
function connectorAuthApplies(
  connector: ConnectorDefinition,
  typeValue: unknown
): boolean {
  const hasTypeField = connector.configFields.some(
    (field) => field.key === "type"
  );
  return hasTypeField ? typeValue === "stocks" : true;
}

function ConnectorTokenField({
  auth,
  error,
  name,
  onBlur,
  onChange,
  value,
}: {
  auth: ConnectorAuthSpec;
  error?: string;
  name: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: ConfigDraftValue;
}): ReactNode {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="connector-token">
        {auth.label}
        {auth.required ? null : (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </FieldLabel>
      <FieldContent>
        <Input
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          id="connector-token"
          name={name}
          onBlur={onBlur}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          type="password"
          value={typeof value === "string" ? value : ""}
        />
        <FieldDescription>
          {auth.help} Saved only in this browser.
        </FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}

export interface DatabaseCreatePanelProps {
  /** Fired with the new database id once it has been inserted. */
  onCreated: (databaseId: string) => void;
}

/** Three-tab creation panel: New, Linked (stub), and Synced. */
export function DatabaseCreatePanel({
  onCreated,
}: DatabaseCreatePanelProps): ReactNode {
  const [connector, setConnector] = useState<ConnectorDefinition | null>(null);

  const handleCreateLocal = () => {
    const seed = createDefaultDatabaseSeed();
    createDatabaseWithDefaults(seed);
    onCreated(seed.database.id);
  };

  return (
    <Tabs className="gap-0" defaultValue="new">
      <div className="relative w-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 border-border border-b"
        />
        <TabsList className="relative z-[1]" variant="line">
          <TabsTrigger value="new">
            <IconTable />
            New
          </TabsTrigger>
          <TabsTrigger value="linked">
            <IconLink />
            Linked
          </TabsTrigger>
          <TabsTrigger value="sync">
            <IconRefresh />
            Synced
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="mt-3 space-y-2" value="new">
        <p className="text-muted-foreground text-sm">
          Start with an empty table and add your own properties and rows.
        </p>
        <Button className="w-full" onClick={handleCreateLocal}>
          Create table
        </Button>
      </TabsContent>
      <TabsContent className="mt-3 space-y-2" value="linked">
        <DatabaseLinkPicker onSelect={onCreated} />
      </TabsContent>
      <TabsContent className="mt-3" value="sync">
        {connector ? (
          <ConnectorConfigForm
            connector={connector}
            onBack={() => {
              setConnector(null);
            }}
            onCreated={onCreated}
          />
        ) : (
          <ConnectorList onSelect={setConnector} />
        )}
      </TabsContent>
    </Tabs>
  );
}

interface ConnectorListProps {
  onSelect: (connector: ConnectorDefinition) => void;
}

/** Connector cards: icon, title, and description from the registry. */
function ConnectorList({ onSelect }: ConnectorListProps): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      {listConnectors().map((connector) => (
        <button
          className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
          key={connector.id}
          onClick={() => {
            onSelect(connector);
          }}
          type="button"
        >
          <ConnectorIcon
            className="mt-0.5 size-4 shrink-0 stroke-[1.5px] text-muted-foreground"
            icon={connector.icon}
          />
          <span className="min-w-0">
            <span className="block text-foreground text-sm">
              {connector.title}
            </span>
            <span className="block text-muted-foreground text-xs">
              {connector.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface ConnectorConfigFormProps {
  connector: ConnectorDefinition;
  onBack: () => void;
  onCreated: (databaseId: string) => void;
}

/**
 * Config form for one picked connector, generated from its `configFields`
 * ("list" inputs accept comma-separated values; `"instrumentList"` is one
 * ticker per row with a Stock/Crypto toggle in an input-group addon — Enter
 * adds a blank row) plus an optional token input when the connector declares
 * auth. Tokens go to the client-only token store, never into the database
 * config.
 */
function ConnectorConfigForm({
  connector,
  onBack,
  onCreated,
}: ConnectorConfigFormProps): ReactNode {
  // Submit-time validation errors, keyed by config key (or "token").
  const [errors, setErrors] = useState<Record<string, string>>({});
  const focusFirstInput = useFocusOnMount();
  const auth = connector.auth;

  const defaultValues = useMemo(() => {
    const drafts: Record<string, ConfigDraftValue> = {};
    for (const field of connector.configFields) {
      if (field.kind === "instrumentList") {
        drafts[field.key] = [emptyInstrumentDraft()];
        continue;
      }
      drafts[field.key] = field.defaultValue ?? "";
    }
    if (connector.auth) {
      drafts.token = getConnectorToken(connector.id) ?? "";
    }
    return drafts;
  }, [connector]);

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const nextErrors: Record<string, string> = {};
      const token = typeof value.token === "string" ? value.token.trim() : "";
      if (connector.auth?.required && token === "") {
        nextErrors.token = `${connector.auth.label} is required`;
      }

      const raw = buildRawConfig(connector.configFields, value);
      const parsed = connector.configSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? connector.configFields[0]?.key);
          nextErrors[key] ??= issue.message;
        }
      }
      if (!parsed.success || Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        return;
      }

      // Token lives in localStorage only — never in the database config.
      if (connector.auth) {
        setConnectorToken(connector.id, token);
      }
      const seed = buildSyncedDatabaseSeed(connector, parsed.data);
      createDatabaseWithDefaults(seed);
      // The engine adopts the new database via its collection subscription;
      // this is only a best-effort immediate kick (false in follower tabs).
      requestImmediateSync(seed.database.id);
      onCreated(seed.database.id);
    },
  });

  const clearError = (key: string) => {
    setErrors((current) => {
      if (!(key in current)) {
        return current;
      }
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="flex items-center gap-1.5">
        <Button
          aria-label="Back to sources"
          onClick={onBack}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <IconChevronLeft />
        </Button>
        <ConnectorIcon
          className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground"
          icon={connector.icon}
        />
        <span className="min-w-0 truncate text-sm">{connector.title}</span>
      </div>
      {connector.configFields.map((configField, index) => (
        <form.Field key={configField.key} name={configField.key}>
          {(field) => {
            const error = errors[configField.key];
            return (
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor={`connector-${configField.key}`}>
                  {configField.label}
                </FieldLabel>
                <FieldContent>
                  <ConnectorConfigControl
                    configField={configField}
                    error={Boolean(error)}
                    focusRef={index === 0 ? focusFirstInput : undefined}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(value) => {
                      field.handleChange(value);
                      clearError(configField.key);
                    }}
                    value={field.state.value}
                  />
                  {error ? <FieldError>{error}</FieldError> : null}
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      ))}
      {auth ? (
        <form.Subscribe selector={(state) => state.values.type}>
          {(typeValue) =>
            connectorAuthApplies(connector, typeValue) ? (
              <form.Field name="token">
                {(field) => (
                  <ConnectorTokenField
                    auth={auth}
                    error={errors.token}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(value) => {
                      field.handleChange(value);
                      clearError("token");
                    }}
                    value={field.state.value}
                  />
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      ) : null}
      <Button className="w-full" type="submit">
        Create synced table
      </Button>
    </form>
  );
}
