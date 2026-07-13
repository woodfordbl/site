/**
 * Minimal RFC 4180 codec for `content/databases/*∕rows.csv` — UTF-8, LF,
 * header row, minimal quoting. One deliberate extension: a cell is `null`
 * (absent — a sparse row simply has no value) when written bare-empty, and
 * `""` (present, empty string) when written as `""`. Row values are sparse
 * maps, so the distinction keeps content hashes stable across round trips.
 */

export type CsvCell = string | null;

const NEEDS_QUOTING_RE = /[",\r\n]/;

function printCell(cell: CsvCell): string {
  if (cell === null) {
    return "";
  }
  if (cell === "" || NEEDS_QUOTING_RE.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

/** Rows → CSV text with a trailing newline. */
export function printCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `${rows.map((row) => row.map(printCell).join(",")).join("\n")}\n`;
}

interface ParserState {
  index: number;
  quoted: boolean;
  value: string;
}

/** Consume a quoted run starting after the opening quote. */
function consumeQuoted(text: string, state: ParserState): void {
  while (state.index < text.length) {
    const char = text[state.index];
    if (char === '"') {
      if (text[state.index + 1] === '"') {
        state.value += '"';
        state.index += 2;
        continue;
      }
      state.index += 1;
      return;
    }
    state.value += char;
    state.index += 1;
  }
}

/** CSV text → rows. Tolerates CRLF and a missing trailing newline. */
export function parseCsv(text: string): CsvCell[][] {
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  const state: ParserState = { index: 0, quoted: false, value: "" };

  const pushCell = () => {
    if (state.quoted) {
      row.push(state.value);
    } else {
      row.push(state.value.length > 0 ? state.value : null);
    }
    state.value = "";
    state.quoted = false;
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (state.index < text.length) {
    const char = text[state.index];
    if (char === '"' && state.value.length === 0 && !state.quoted) {
      state.quoted = true;
      state.index += 1;
      consumeQuoted(text, state);
      continue;
    }
    if (char === ",") {
      pushCell();
      state.index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[state.index + 1] === "\n") {
        state.index += 1;
      }
      pushRow();
      state.index += 1;
      continue;
    }
    state.value += char;
    state.index += 1;
  }
  if (state.value.length > 0 || state.quoted || row.length > 0) {
    pushRow();
  }
  return rows;
}
