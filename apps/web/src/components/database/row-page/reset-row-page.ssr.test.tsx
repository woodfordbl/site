/** @vitest-environment node */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { useResetRowPageTarget } from "@/components/database/row-page/reset-row-page.tsx";

/**
 * @fileoverview Server-render guard for the row-page reset.
 *
 * This hook runs inside the page header's ⋯ menu, which renders on *every*
 * page. The local collections it needs are the kind read through
 * `useLiveQuery`, which subscribes without a server snapshot — reaching one
 * during SSR aborts the whole page render and drops the site to client
 * rendering, so a crawler gets an empty shell. Both reads here go through
 * snapshot hooks instead; this pins that, because the obvious way to write the
 * hook (`useDatabase` + `useRowTemplate`) does abort, measured.
 *
 * Only the router and query providers are stubbed — the real app supplies
 * both. Nothing that touches the local collections is, so a `useLiveQuery`
 * sneaking back in still fails here.
 */

vi.mock("@tanstack/react-router", () => ({
  useLoaderData: () => ({ serverPages: [] }),
  useNavigate: () => () => undefined,
  useRouteContext: () => ({ localPagePreview: [] }),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => ({ data: undefined }),
  useQueryClient: () => ({ getQueryData: () => undefined }),
}));

function Probe() {
  const target = useResetRowPageTarget("page-1");
  return <span>{target ? "offered" : "none"}</span>;
}

describe("useResetRowPageTarget on the server", () => {
  it("renders without reaching a live query", () => {
    expect(renderToString(<Probe />)).toContain("none");
  });
});
