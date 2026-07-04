import { afterEach, describe, expect, it, vi } from "vitest";

import { githubReposConnector } from "@/lib/connectors/github-repos.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";

const REPOS_URL =
  "https://api.github.com/users/octocat/repos?sort=pushed&per_page=100";

const repoFixture = [
  {
    id: 1_296_269,
    name: "hello-world",
    full_name: "octocat/hello-world",
    description: "My first repository on GitHub!",
    stargazers_count: 2543,
    forks_count: 1042,
    language: "TypeScript",
    pushed_at: "2026-06-30T12:34:56Z",
    html_url: "https://github.com/octocat/hello-world",
    fork: false,
  },
  {
    id: 18_221_276,
    name: "git-consortium",
    full_name: "octocat/git-consortium",
    description: null,
    stargazers_count: 0,
    forks_count: 0,
    language: null,
    pushed_at: null,
    html_url: "https://github.com/octocat/git-consortium",
    fork: true,
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

describe("githubReposConnector.fetchRows", () => {
  it("builds the repos URL with GitHub Accept header and no auth by default", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(repoFixture), { status: 200 })
    );
    await githubReposConnector.fetchRows({
      config: { username: "octocat" },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(REPOS_URL);
    expect(calls[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect(calls[0].headers.has("authorization")).toBe(false);
    expect(calls[0].headers.has("if-none-match")).toBe(false);
  });

  it("sends If-None-Match and Bearer Authorization when etag/token present", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(repoFixture), { status: 200 })
    );
    await githubReposConnector.fetchRows({
      config: { username: "octocat" },
      etag: 'W/"abc123"',
      token: "github_pat_secret",
      fetchFn,
    });
    expect(calls[0].headers.get("if-none-match")).toBe('W/"abc123"');
    expect(calls[0].headers.get("authorization")).toBe(
      "Bearer github_pat_secret"
    );
  });

  it("maps repos to rows keyed by sourceKey and returns the response etag", async () => {
    const { fetchFn } = createFetchStub(
      new Response(JSON.stringify(repoFixture), {
        status: 200,
        headers: { etag: 'W/"snapshot-1"' },
      })
    );
    const result = await githubReposConnector.fetchRows({
      config: { username: "octocat" },
      fetchFn,
    });
    expect(result).toEqual({
      kind: "rows",
      etag: 'W/"snapshot-1"',
      rows: [
        {
          externalId: "1296269",
          values: {
            name: "hello-world",
            description: "My first repository on GitHub!",
            stars: 2543,
            forks: 1042,
            language: "TypeScript",
            updatedAt: "2026-06-30",
            url: "https://github.com/octocat/hello-world",
          },
        },
        {
          externalId: "18221276",
          values: {
            name: "git-consortium",
            description: null,
            stars: 0,
            forks: 0,
            language: null,
            updatedAt: null,
            url: "https://github.com/octocat/git-consortium",
          },
        },
      ],
    });
  });

  it("returns notModified on 304", async () => {
    const { fetchFn } = createFetchStub(new Response(null, { status: 304 }));
    const result = await githubReposConnector.fetchRows({
      config: { username: "octocat" },
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
      githubReposConnector.fetchRows({
        config: { username: "octocat" },
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
      githubReposConnector.fetchRows({
        config: { username: "octocat" },
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
      githubReposConnector.fetchRows({
        config: { username: "nobody-here" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("config");
    expect(error.message).toBe("User not found");
  });

  it("maps 401 to an auth error", async () => {
    const { fetchFn } = createFetchStub(
      new Response("bad credentials", { status: 401 })
    );
    const error = await expectConnectorError(
      githubReposConnector.fetchRows({
        config: { username: "octocat" },
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
      githubReposConnector.fetchRows({
        config: { username: "octocat" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("network");
  });

  it("rejects invalid config with a config error before fetching", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(repoFixture), { status: 200 })
    );
    const error = await expectConnectorError(
      githubReposConnector.fetchRows({ config: {}, fetchFn })
    );
    expect(error.kind).toBe("config");
    expect(calls).toHaveLength(0);
  });
});
