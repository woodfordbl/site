import { useLiveQuery } from "@tanstack/react-db";

import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";

const panelStyle = {
  padding: "12px",
  fontFamily: "ui-monospace, monospace",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "var(--tanstack-devtools-foreground, #e4e4e7)",
  background: "var(--tanstack-devtools-background, #18181b)",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box" as const,
};

const sectionStyle = {
  marginBottom: "16px",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "6px",
  padding: "10px",
};

const headingStyle = {
  margin: "0 0 8px",
  fontSize: "13px",
  fontWeight: 600,
};

const metaStyle = {
  margin: "0 0 8px",
  opacity: 0.75,
};

const preStyle = {
  margin: 0,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  maxHeight: "240px",
  overflow: "auto",
};

function LocalPagesInspector() {
  const {
    data = [],
    isLoading,
    isError,
  } = useLiveQuery((query) => query.from({ page: localPagesCollection }));

  return (
    <section style={sectionStyle}>
      <h3 style={headingStyle}>Local pages</h3>
      <p style={metaStyle}>
        id: {localPagesCollection.id} · status: {localPagesCollection.status} ·
        size: {localPagesCollection.size}
        {isLoading ? " · loading" : ""}
        {isError ? " · error" : ""}
      </p>
      <pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}

function LocalBlocksInspector() {
  const {
    data = [],
    isLoading,
    isError,
  } = useLiveQuery((query) => query.from({ block: localBlocksCollection }));

  return (
    <section style={sectionStyle}>
      <h3 style={headingStyle}>Local blocks</h3>
      <p style={metaStyle}>
        id: {localBlocksCollection.id} · status: {localBlocksCollection.status}{" "}
        · size: {localBlocksCollection.size}
        {isLoading ? " · loading" : ""}
        {isError ? " · error" : ""}
      </p>
      <pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}

export function TanStackDbDevtoolsPanel() {
  return (
    <div style={panelStyle}>
      <p style={{ ...metaStyle, marginTop: 0 }}>
        Local TanStack DB page metadata and block rows (sharded in localStorage
        per page). Server JSON is loaded by route loaders.
      </p>
      <LocalPagesInspector />
      <LocalBlocksInspector />
    </div>
  );
}
