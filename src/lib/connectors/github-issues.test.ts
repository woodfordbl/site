import { afterEach, describe, expect, it, vi } from "vitest";

import { githubIssuesConnector } from "@/lib/connectors/github-issues.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";

const ISSUES_URL =
  "https://api.github.com/repos/octocat/hello-world/issues?state=all&sort=updated&direction=desc&per_page=100";

/** One open issue, one closed issue, and one PR-shaped entry to filter out. */
const issueFixture = [
  {
    id: 2001,
    number: 12,
    title: "Login button misaligned on mobile",
    state: "open",
    created_at: "2026-06-28T09:00:00Z",
    updated_at: "2026-07-03T18:30:00Z",
    html_url: "https://github.com/octocat/hello-world/issues/12",
    user: { login: "octocat" },
    labels: [{ name: "bug" }, { name: "ui" }],
    assignees: [{ login: "hubot" }],
    comments: 4,
  },
  {
    id: 2002,
    number: 10,
    title: "Document deployment steps",
    state: "closed",
    created_at: "2026-06-20T08:00:00Z",
    updated_at: "2026-06-25T14:00:00Z",
    html_url: "https://github.com/octocat/hello-world/issues/10",
    user: { login: "octocat" },
    labels: [],
    assignees: [],
    comments: 0,
  },
  {
    id: 2003,
    number: 42,
    title: "Add feature flag plumbing",
    state: "open",
    created_at: "2026-06-28T09:00:00Z",
    updated_at: "2026-07-03T18:30:00Z",
    html_url: "https://github.com/octocat/hello-world/pull/42",
    user: { login: "octocat" },
    labels: [],
    assignees: [],
    comments: 2,
    pull_request: {
      url: "https://api.github.com/repos/octocat/hello-world/pulls/42",
    },
  },
];

function createFetchStub(response: Response) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return Promise.resolve(response);
  };
  return { calls, fetchFn };
}

/** Serves one queued response per call, recording each request. */
function createPagedFetchStub(responses: Response[]) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    const next = responses[calls.length - 1];
    if (!next) {
      throw new Error(`Unexpected request #${calls.length}`);
    }
    return Promise.resolve(next);
  };
  return { calls, fetchFn };
}

/** A minimal parseable issue payload entry with a distinct id/number. */
function makeIssue(id: number) {
  return {
    id,
    number: id,
    title: `Issue ${id}`,
    state: "open",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
    html_url: `https://github.com/octocat/hello-world/issues/${id}`,
    user: { login: "octocat" },
    labels: [],
    assignees: [],
    comments: 0,
  };
}

async function expectConnectorError(
  promise: Promise<unknown>
): Promise<ConnectorError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConnectorError) {
      return error;
    }
    throw new Error(`Expected ConnectorError, got: ${String(error)}`);
  }
  throw new Error("Expected fetchRows to throw");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("githubIssuesConnector.fields", () => {
  it("declares state as a select with open and closed options", () => {
    const fields = githubIssuesConnector.fields({
      owner: "octocat",
      repo: "hello-world",
      state: "all",
    });
    const state = fields.find((field) => field.sourceKey === "state");
    expect(state?.type).toBe("select");
    expect(state?.options).toEqual([
      { id: "open", name: "Open", color: "green" },
      { id: "closed", name: "Closed", color: "red" },
    ]);
  });

  it("declares title as the primary field", () => {
    expect(githubIssuesConnector.primarySourceKey).toBe("title");
  });
});

describe("githubIssuesConnector.fetchRows", () => {
  it("builds the issues URL with GitHub Accept header and no auth by default", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(issueFixture), { status: 200 })
    );
    await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world" },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ISSUES_URL);
    expect(calls[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect(calls[0].headers.has("authorization")).toBe(false);
    expect(calls[0].headers.has("if-none-match")).toBe(false);
  });

  it("honors the state config in the URL", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world", state: "open" },
      fetchFn,
    });
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/octocat/hello-world/issues?state=open&sort=updated&direction=desc&per_page=100"
    );
  });

  it("sends If-None-Match and Bearer Authorization when etag/token present", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(issueFixture), { status: 200 })
    );
    await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world" },
      etag: 'W/"abc123"',
      token: "github_pat_secret",
      fetchFn,
    });
    expect(calls[0].headers.get("if-none-match")).toBe('W/"abc123"');
    expect(calls[0].headers.get("authorization")).toBe(
      "Bearer github_pat_secret"
    );
  });

  it("maps issues to rows, filters pull requests, and returns the etag", async () => {
    const { fetchFn } = createFetchStub(
      new Response(JSON.stringify(issueFixture), {
        status: 200,
        headers: { etag: 'W/"snapshot-1"' },
      })
    );
    const result = await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world" },
      fetchFn,
    });
    expect(result).toEqual({
      kind: "rows",
      etag: 'W/"snapshot-1"',
      rows: [
        {
          externalId: "2001",
          values: {
            title: "Login button misaligned on mobile",
            number: 12,
            author: "octocat",
            state: "open",
            labels: "bug, ui",
            assignees: "hubot",
            comments: 4,
            createdAt: "2026-06-28",
            updatedAt: "2026-07-03",
            url: "https://github.com/octocat/hello-world/issues/12",
          },
        },
        {
          externalId: "2002",
          values: {
            title: "Document deployment steps",
            number: 10,
            author: "octocat",
            state: "closed",
            labels: null,
            assignees: null,
            comments: 0,
            createdAt: "2026-06-20",
            updatedAt: "2026-06-25",
            url: "https://github.com/octocat/hello-world/issues/10",
          },
        },
      ],
    });
  });

  it('follows Link rel="next" pagination and aggregates rows across pages', async () => {
    const page2Url = `${ISSUES_URL}&page=2`;
    const { calls, fetchFn } = createPagedFetchStub([
      new Response(JSON.stringify([makeIssue(1), makeIssue(2)]), {
        status: 200,
        headers: {
          etag: 'W/"page-1"',
          link: `<${page2Url}>; rel="next", <${ISSUES_URL}&page=9>; rel="last"`,
        },
      }),
      new Response(JSON.stringify([makeIssue(3)]), {
        status: 200,
        headers: { etag: 'W/"page-2"' },
      }),
    ]);

    const result = await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world" },
      etag: 'W/"stale"',
      fetchFn,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(ISSUES_URL);
    expect(calls[1].url).toBe(page2Url);
    expect(calls[0].headers.get("if-none-match")).toBe('W/"stale"');
    expect(calls[1].headers.has("if-none-match")).toBe(false);
    if (result.kind !== "rows") {
      throw new Error("expected rows");
    }
    expect(result.rows.map((row) => row.externalId)).toEqual(["1", "2", "3"]);
    expect(result.etag).toBe('W/"page-1"');
  });

  it("stops following pagination at the 3-page cap", async () => {
    const withNext = (page: number) =>
      new Response(JSON.stringify([makeIssue(page)]), {
        status: 200,
        headers: { link: `<${ISSUES_URL}&page=${page + 1}>; rel="next"` },
      });
    const { calls, fetchFn } = createPagedFetchStub([
      withNext(1),
      withNext(2),
      withNext(3),
    ]);

    const result = await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world" },
      fetchFn,
    });

    expect(calls).toHaveLength(3);
    if (result.kind !== "rows") {
      throw new Error("expected rows");
    }
    expect(result.rows.map((row) => row.externalId)).toEqual(["1", "2", "3"]);
  });

  it("returns notModified on 304", async () => {
    const { fetchFn } = createFetchStub(new Response(null, { status: 304 }));
    const result = await githubIssuesConnector.fetchRows({
      config: { owner: "octocat", repo: "hello-world" },
      etag: 'W/"abc123"',
      fetchFn,
    });
    expect(result).toEqual({ kind: "notModified" });
  });

  it("maps 403 with Retry-After to a rateLimit error with retryAfterMs", async () => {
    const { fetchFn } = createFetchStub(
      new Response("rate limited", {
        status: 403,
        headers: { "retry-after": "120" },
      })
    );
    const error = await expectConnectorError(
      githubIssuesConnector.fetchRows({
        config: { owner: "octocat", repo: "hello-world" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("rateLimit");
    expect(error.retryAfterMs).toBe(120_000);
  });

  it("maps 429 with x-ratelimit-reset to retryAfterMs relative to now", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-07-04T00:00:00Z");
    vi.setSystemTime(now);
    const resetEpochSeconds = Math.floor(now.getTime() / 1000) + 90;
    const { fetchFn } = createFetchStub(
      new Response("rate limited", {
        status: 429,
        headers: { "x-ratelimit-reset": String(resetEpochSeconds) },
      })
    );
    const error = await expectConnectorError(
      githubIssuesConnector.fetchRows({
        config: { owner: "octocat", repo: "hello-world" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("rateLimit");
    expect(error.retryAfterMs).toBe(90_000);
  });

  it("maps 404 to a config error", async () => {
    const { fetchFn } = createFetchStub(
      new Response("not found", { status: 404 })
    );
    const error = await expectConnectorError(
      githubIssuesConnector.fetchRows({
        config: { owner: "octocat", repo: "no-such-repo" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("config");
    expect(error.message).toBe("Repository not found");
  });

  it("maps 401 to an auth error", async () => {
    const { fetchFn } = createFetchStub(
      new Response("bad credentials", { status: 401 })
    );
    const error = await expectConnectorError(
      githubIssuesConnector.fetchRows({
        config: { owner: "octocat", repo: "hello-world" },
        token: "expired",
        fetchFn,
      })
    );
    expect(error.kind).toBe("auth");
  });

  it("maps a rejected fetch to a network error", async () => {
    const fetchFn: typeof fetch = () =>
      Promise.reject(new TypeError("Failed to fetch"));
    const error = await expectConnectorError(
      githubIssuesConnector.fetchRows({
        config: { owner: "octocat", repo: "hello-world" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("network");
  });

  it("rejects invalid config with a config error before fetching", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(issueFixture), { status: 200 })
    );
    const error = await expectConnectorError(
      githubIssuesConnector.fetchRows({ config: { owner: "octocat" }, fetchFn })
    );
    expect(error.kind).toBe("config");
    expect(calls).toHaveLength(0);
  });
});
