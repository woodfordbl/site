import { z } from "zod";
import {
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_NOT_MODIFIED,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_UNAUTHORIZED,
  rateLimitResetMsFromHeaders,
  retryAfterMsFromHeaders,
} from "@/lib/connectors/http.ts";
import {
  type ConnectorDefinition,
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorFieldDef,
  type ConnectorRow,
} from "@/lib/connectors/types.ts";

/**
 * GitHub public repositories connector: one row per repo for a username,
 * newest-pushed first, one page (100 repos) in v1. `api.github.com` sends
 * `Access-Control-Allow-Origin: *` and exposes `ETag` cross-origin, so this
 * polls directly from the browser with conditional requests — authenticated
 * 304s are free against the 5,000 req/hr PAT quota (proposal §4.1).
 */

const githubReposConfigSchema = z.object({
  /** GitHub login whose public repos are synced. */
  username: z.string().min(1),
});

type GithubReposConfig = z.infer<typeof githubReposConfigSchema>;

/** The subset of the REST repo payload this connector maps into cells. */
const githubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable(),
  pushed_at: z.string().nullable(),
  html_url: z.string(),
});

const githubRepoListSchema = z.array(githubRepoSchema);

/**
 * Canonical synced schema. `language` is intentionally `text`, not `select`:
 * select options live in the database schema, so a select column would need
 * the sync engine to write schema (accumulate option ids/colors) on every
 * poll — v1 sync only writes row values, so plain text keeps the diff
 * row-only at the cost of colored chips.
 */
const GITHUB_REPO_FIELDS: ConnectorFieldDef[] = [
  { sourceKey: "name", name: "Name", type: "text", icon: "tabler:IconBook" },
  {
    sourceKey: "description",
    name: "Description",
    type: "text",
    icon: "tabler:IconFileDescription",
  },
  {
    sourceKey: "stars",
    name: "Stars",
    type: "number",
    numberFormat: "integer",
    icon: "tabler:IconStar",
  },
  {
    sourceKey: "forks",
    name: "Forks",
    type: "number",
    numberFormat: "integer",
    icon: "tabler:IconGitFork",
  },
  {
    sourceKey: "language",
    name: "Language",
    type: "text",
    icon: "tabler:IconCode",
  },
  {
    sourceKey: "updatedAt",
    name: "Last pushed",
    type: "date",
    icon: "tabler:IconGitCommit",
  },
  {
    sourceKey: "url",
    name: "URL",
    type: "url",
    icon: "tabler:IconExternalLink",
  },
];

const ISO_DATE_PART_LENGTH = 10;

const MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;

function parseConfig(config: Record<string, unknown>): GithubReposConfig {
  const parsed = githubReposConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid GitHub connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function toConnectorRow(repo: z.infer<typeof githubRepoSchema>): ConnectorRow {
  return {
    externalId: String(repo.id),
    values: {
      name: repo.name,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      updatedAt: repo.pushed_at
        ? repo.pushed_at.slice(0, ISO_DATE_PART_LENGTH)
        : null,
      url: repo.html_url,
    },
  };
}

/** Map non-OK responses to the `ConnectorError` taxonomy and throw. */
function throwForStatus(response: Response): never {
  if (
    response.status === HTTP_STATUS_FORBIDDEN ||
    response.status === HTTP_STATUS_TOO_MANY_REQUESTS
  ) {
    throw new ConnectorError("GitHub rate limit exceeded", {
      kind: "rateLimit",
      retryAfterMs:
        retryAfterMsFromHeaders(response.headers) ??
        rateLimitResetMsFromHeaders(response.headers),
    });
  }
  if (response.status === HTTP_STATUS_NOT_FOUND) {
    throw new ConnectorError("User not found", { kind: "config" });
  }
  if (response.status === HTTP_STATUS_UNAUTHORIZED) {
    throw new ConnectorError("GitHub token was rejected", { kind: "auth" });
  }
  throw new ConnectorError(`GitHub request failed (${response.status})`, {
    kind: "network",
  });
}

/**
 * Repos beyond `MAX_PAGES × 100` are not fetched; the sync layer's tombstone
 * grace ages them out honestly rather than truncation deleting them abruptly
 * (same policy and Link-following pattern as the pull-requests connector).
 */
const MAX_PAGES = 3;

/** Matches one `Link` header entry carrying `rel="next"`. */
const NEXT_LINK_PATTERN = /<([^>]+)>\s*;[^,]*\brel="next"/;

/** Extract the `rel="next"` target from a `Link` response header, if any. */
function nextPageUrl(headers: Headers): string | undefined {
  const link = headers.get("link");
  if (link === null) {
    return;
  }
  for (const part of link.split(",")) {
    const match = NEXT_LINK_PATTERN.exec(part);
    if (match) {
      return match[1];
    }
  }
  return;
}

async function fetchPage(
  ctx: ConnectorFetchContext,
  url: string,
  isFirstPage: boolean
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  // Conditional request on page 1 only: one etag covers the snapshot and a
  // 304 short-circuits the whole poll (per-page etags are not worth storing).
  if (isFirstPage && ctx.etag !== undefined) {
    headers["If-None-Match"] = ctx.etag;
  }
  if (ctx.token !== undefined) {
    headers.Authorization = `Bearer ${ctx.token}`;
  }
  try {
    return await ctx.fetchFn(url, { headers });
  } catch (cause) {
    throw new ConnectorError("GitHub request failed", {
      kind: "network",
      cause,
    });
  }
}

function parseRepoPage(json: unknown): ConnectorRow[] {
  const payload = githubRepoListSchema.safeParse(json);
  if (!payload.success) {
    throw new ConnectorError("Unexpected GitHub response shape", {
      kind: "network",
      cause: payload.error,
    });
  }
  return payload.data.map(toConnectorRow);
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { username } = parseConfig(ctx.config);
  const firstUrl = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100`;
  const rows: ConnectorRow[] = [];
  let etag: string | undefined;
  let url: string | undefined = firstUrl;

  for (let page = 1; page <= MAX_PAGES && url !== undefined; page += 1) {
    const response = await fetchPage(ctx, url, page === 1);
    if (page === 1 && response.status === HTTP_STATUS_NOT_MODIFIED) {
      return { kind: "notModified" };
    }
    if (!response.ok) {
      throwForStatus(response);
    }
    rows.push(...parseRepoPage(await response.json()));
    if (page === 1) {
      etag = response.headers.get("etag") ?? undefined;
    }
    url = nextPageUrl(response.headers);
  }

  return { kind: "rows", rows, etag };
}

/** GitHub public-repos connector definition. */
export const githubReposConnector: ConnectorDefinition<GithubReposConfig> = {
  id: "github-repos",
  title: "GitHub repositories",
  description: "Public repositories for a username, newest-pushed first.",
  icon: "tabler:IconBrandGithub",
  configSchema: githubReposConfigSchema,
  configFields: [
    {
      key: "username",
      label: "GitHub username",
      placeholder: "octocat",
      kind: "text",
    },
  ],
  fields() {
    return GITHUB_REPO_FIELDS;
  },
  primarySourceKey: "name",
  fetchRows,
  pollPolicy: { minMs: MINUTE_MS, defaultMs: FIVE_MINUTES_MS },
};
