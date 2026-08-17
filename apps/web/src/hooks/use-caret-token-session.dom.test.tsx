/** @vitest-environment jsdom */
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useCaretTokenSession } from "@/hooks/use-caret-token-session.ts";
import type { CaretTokenContext } from "@/lib/editor/caret-token-trigger.ts";

/**
 * The session is driven by rich-text `input` events, so the harness fakes the
 * field plus a `readContext` whose answer the test controls — that stands in
 * for "is a `$…` run under the caret right now".
 */
function mountSession(read: () => CaretTokenContext | null) {
  const field = document.createElement("div");
  field.setAttribute("data-canvas-field", "");
  field.setAttribute("contenteditable", "true");
  document.body.append(field);

  const seen: (CaretTokenContext | null)[] = [];
  let close: (() => void) | undefined;

  function Harness() {
    const session = useCaretTokenSession(read);
    seen.push(session.context);
    close = session.close;
    return null;
  }

  render(<Harness />);

  const type = () => {
    act(() => {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  return {
    close: () => act(() => close?.()),
    field,
    latest: () => seen.at(-1) ?? null,
    type,
  };
}

function runContext(field: HTMLElement, query: string): CaretTokenContext {
  return {
    end: query.length + 1,
    field,
    query,
    start: 0,
    trigger: "$",
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useCaretTokenSession", () => {
  it("opens while a trigger run is under the caret", () => {
    const harness = mountSession(() => runContext(document.body, ""));
    harness.type();
    expect(harness.latest()).toMatchObject({ trigger: "$" });
  });

  it("stays closed for the rest of a run the user dismissed", () => {
    let query = "";
    const harness = mountSession(() => runContext(document.body, query));

    harness.type();
    expect(harness.latest()).not.toBeNull();

    // Escape / click-away while the `$` is still typed.
    harness.close();
    expect(harness.latest()).toBeNull();

    // Typing on must NOT reopen it — `$50` is a price.
    query = "5";
    harness.type();
    expect(harness.latest()).toBeNull();
    query = "50";
    harness.type();
    expect(harness.latest()).toBeNull();
  });

  it("opens again once the dismissed run has ended", () => {
    let context: CaretTokenContext | null = runContext(document.body, "");
    const harness = mountSession(() => context);

    harness.type();
    harness.close();
    harness.type();
    expect(harness.latest()).toBeNull();

    // Run ends (whitespace typed, trigger deleted, caret moved away).
    context = null;
    harness.type();
    expect(harness.latest()).toBeNull();

    // A fresh trigger is offered again.
    context = runContext(document.body, "");
    harness.type();
    expect(harness.latest()).toMatchObject({ trigger: "$" });
  });

  it("does not suppress when the run is already gone (confirmed insert)", () => {
    let context: CaretTokenContext | null = runContext(document.body, "rate");
    const harness = mountSession(() => context);

    harness.type();
    // Insert replaces the run with a token, THEN the session closes.
    context = null;
    harness.close();

    context = runContext(document.body, "");
    harness.type();
    expect(harness.latest()).toMatchObject({ trigger: "$" });
  });
});
