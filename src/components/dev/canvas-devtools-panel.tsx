import { useSyncExternalStore } from "react";

import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  getCanvasDevtoolsState,
  isCanvasDebugOverlayEnabled,
  setCanvasDebugOverlayEnabled,
  subscribeCanvasDebugOverlay,
  subscribeCanvasDevtools,
} from "@/lib/canvas/canvas-devtools-store.ts";

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

const rowButtonStyle = {
  display: "block",
  width: "100%",
  textAlign: "left" as const,
  background: "none",
  border: "none",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
  padding: "1px 0",
};

const nullState = () => null;
const overlayOff = () => false;

/** Scroll to a row's shell and flash an outline so it can be spotted. */
function flashRow(rowId: string): void {
  const shell = document.querySelector(
    `[data-canvas-row-id="${CSS.escape(rowId)}"]`
  );
  if (!(shell instanceof HTMLElement)) {
    return;
  }
  shell.scrollIntoView({ block: "center", behavior: "smooth" });
  shell.style.outline = "2px solid #38bdf8";
  shell.style.outlineOffset = "2px";
  setTimeout(() => {
    shell.style.outline = "";
    shell.style.outlineOffset = "";
  }, 1200);
}

function RowNode({
  depth,
  row,
  selectedIds,
}: {
  depth: number;
  row: CanvasRow;
  selectedIds: ReadonlySet<string>;
}) {
  const block = row.effectiveBlock;
  const isSelected = selectedIds.has(row.rowId);

  return (
    <>
      <button
        onClick={() => flashRow(row.rowId)}
        style={{
          ...rowButtonStyle,
          paddingLeft: depth * 14,
          color: isSelected ? "#38bdf8" : "inherit",
        }}
        type="button"
      >
        {block.type}
        <span style={{ opacity: 0.55 }}> · {row.rowId.slice(0, 8)}</span>
        {isSelected ? " ✓" : ""}
      </button>
      {row.children.map((child) => (
        <RowNode
          depth={depth + 1}
          key={child.rowId}
          row={child}
          selectedIds={selectedIds}
        />
      ))}
    </>
  );
}

/**
 * Devtools panel for the block canvas: live selection/focus state and the row
 * tree (click a row to flash it in the page), plus the geometry overlay
 * toggle. Fed by the editor via publishCanvasDevtoolsState.
 */
export function CanvasDevtoolsPanel() {
  const state = useSyncExternalStore(
    subscribeCanvasDevtools,
    getCanvasDevtoolsState,
    nullState
  );
  const overlayEnabled = useSyncExternalStore(
    subscribeCanvasDebugOverlay,
    isCanvasDebugOverlayEnabled,
    overlayOff
  );

  if (!state) {
    return (
      <div style={panelStyle}>
        <p style={metaStyle}>No canvas editor mounted.</p>
      </div>
    );
  }

  const selectedIds = new Set(state.selection.selectedRowIds);

  return (
    <div style={panelStyle}>
      <section style={sectionStyle}>
        <h3 style={headingStyle}>Geometry overlay</h3>
        <label style={{ cursor: "pointer" }}>
          <input
            checked={overlayEnabled}
            onChange={(event) =>
              setCanvasDebugOverlayEnabled(event.target.checked)
            }
            type="checkbox"
          />{" "}
          Paint row rects (blue) and content scopes (green)
        </label>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Selection</h3>
        <p style={metaStyle}>
          {state.selection.selectedRowIds.length} selected · anchor:{" "}
          {state.selection.anchorRowId?.slice(0, 8) ?? "—"}
        </p>
        {state.selection.selectedRowIds.map((id) => (
          <button
            key={id}
            onClick={() => flashRow(id)}
            style={rowButtonStyle}
            type="button"
          >
            {id}
          </button>
        ))}
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Focus</h3>
        <p style={metaStyle}>
          {state.focus
            ? `${state.focus.rowId.slice(0, 8)} · ${state.focus.placement ?? "—"}`
            : "none"}
        </p>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Row tree</h3>
        {state.rows.map((row) => (
          <RowNode
            depth={0}
            key={row.rowId}
            row={row}
            selectedIds={selectedIds}
          />
        ))}
      </section>
    </div>
  );
}
