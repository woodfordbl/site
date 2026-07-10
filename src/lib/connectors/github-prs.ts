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
 * GitHub pull requests connector: one row per PR for a repo, newest-updated
 * first, following `Link rel="next"` pagination up to {@link MAX_PAGES} pages
 * ({@link MAX_PAGES} × 100 PRs). Same direct-from-browser conditional-GET
 * discipline as `github-repos` (api.github.com sends
 * `Access-Control-Allow-Origin: *` and exposes `ETag` cross-origin).
 *
 * The `state` column is a **select** with static options — unlike repo
 * language, PR status is a closed set (open/draft/merged/closed), so options
 * can be declared up front and the sync engine never needs to write schema.
 * Cell values store the option ids, so pills and Linear-style status grouping
 * resolve directly.
 */

const githubPrsConfigSchema = z.object({
  /** Repository owner (user or organization login). */
  owner: z.string().min(1),
  /** Repository name. */
  repo: z.string().min(1),
  /** GitHub list filter; "all" includes closed and merged PRs. */
  state: z.enum(["all", "open"]).default("all"),
});

type GithubPrsConfig = z.infer<typeof githubPrsConfigSchema>;

/** The subset of the REST pull-request list payload this connector maps. */
const githubPrSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  draft: z.boolean().optional(),
  merged_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  user: z.object({ login: z.string() }).nullable(),
  head: z.object({ ref: z.string() }),
});

const githubPrListSchema = z.array(githubPrSchema);

/** Option ids double as the cell values `toConnectorRow` emits. */
const PR_STATE_OPTIONS = [
  { id: "open", name: "Open", color: "green" },
  { id: "draft", name: "Draft", color: "gray" },
  { id: "merged", name: "Merged", color: "purple" },
  { id: "closed", name: "Closed", color: "red" },
] as const;

/**
 * Canonical synced schema. `comments` is intentionally absent — the list
 * endpoint's payload does not include comment counts (only the single-PR
 * endpoint does).
 */
const GITHUB_PR_FIELDS: ConnectorFieldDef[] = [
  {
    sourceKey: "title",
    name: "Title",
    type: "text",
    icon: "tabler:IconGitPullRequest",
  },
  {
    sourceKey: "number",
    name: "Number",
    type: "number",
    numberFormat: "integer",
    icon: "tabler:IconHash",
  },
  {
    sourceKey: "author",
    name: "Author",
    type: "text",
    icon: "tabler:IconUser",
  },
  {
    sourceKey: "state",
    name: "State",
    type: "select",
    options: [...PR_STATE_OPTIONS],
    icon: "tabler:IconProgress",
  },
  {
    sourceKey: "createdAt",
    name: "Created",
    type: "date",
    icon: "tabler:IconCalendarPlus",
  },
  {
    sourceKey: "updatedAt",
    name: "Updated",
    type: "date",
    icon: "tabler:IconClock",
  },
  {
    sourceKey: "url",
    name: "URL",
    type: "url",
    icon: "tabler:IconExternalLink",
  },
  {
    sourceKey: "branch",
    name: "Branch",
    type: "text",
    icon: "tabler:IconGitBranch",
  },
];

const ISO_DATE_PART_LENGTH = 10;

const MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;

/**
 * Pagination cap: up to 3 pages × 100 PRs = 300 PRs per snapshot. A hard cap
 * keeps the poll budget bounded (each page is one request against the
 * unauthenticated 60 req/hr quota). PRs beyond the cap — the 301st+ by most
 * recent update — age out honestly: they drop from consecutive snapshots and
 * the sync engine tombstones their rows after its grace window, exactly as
 * if they were deleted upstream, and they re-insert when activity brings
 * them back under the cap.
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

function parseConfig(config: Record<string, unknown>): GithubPrsConfig {
  const parsed = githubPrsConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid GitHub pull requests connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * Derive the `state` option id for one PR: GitHub reports drafts as plain
 * `open` and merged PRs as plain `closed`, so both are re-split here.
 */
function derivePrState(
  pr: z.infer<typeof githubPrSchema>
): "open" | "draft" | "merged" | "closed" {
  if (pr.draft === true && pr.state === "open") {
    return "draft";
  }
  if (pr.merged_at !== null) {
    return "merged";
  }
  return pr.state === "open" ? "open" : "closed";
}

function toConnectorRow(pr: z.infer<typeof githubPrSchema>): ConnectorRow {
  return {
    externalId: String(pr.id),
    values: {
      title: pr.title,
      number: pr.number,
      author: pr.user?.login ?? null,
      state: derivePrState(pr),
      createdAt: pr.created_at.slice(0, ISO_DATE_PART_LENGTH),
      updatedAt: pr.updated_at.slice(0, ISO_DATE_PART_LENGTH),
      url: pr.html_url,
      branch: pr.head.ref,
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
    throw new ConnectorError("Repository not found", { kind: "config" });
  }
  if (response.status === HTTP_STATUS_UNAUTHORIZED) {
    throw new ConnectorError("GitHub token was rejected", { kind: "auth" });
  }
  throw new ConnectorError(`GitHub request failed (${response.status})`, {
    kind: "network",
  });
}

/**
 * Fetch the PR snapshot, following `Link rel="next"` up to {@link MAX_PAGES}
 * pages and aggregating rows across them.
 *
 * ETag handling: the conditional request (`If-None-Match`) covers page 1
 * only, and only page 1's ETag is stored. Per-page validators aren't worth
 * the bookkeeping — page 1 holds the most-recently-updated PRs, so any
 * activity anywhere in the repo changes page 1's ETag; a 304 on page 1 means
 * the whole snapshot is unchanged and short-circuits without fetching
 * further pages.
 */
/** Fetch one page; `conditional` attaches the stored ETag (page 1 only). */
async function fetchPage(
  ctx: ConnectorFetchContext,
  url: string,
  conditional: boolean
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (conditional && ctx.etag !== undefined) {
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

/** Parse one page's payload into connector rows (throws on shape drift). */
function parsePrPage(payload: unknown): ConnectorRow[] {
  const parsed = githubPrListSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConnectorError("Unexpected GitHub response shape", {
      kind: "network",
      cause: parsed.error,
    });
  }
  return parsed.data.map(toConnectorRow);
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { owner, repo, state } = parseConfig(ctx.config);
  const firstUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&sort=updated&direction=desc&per_page=100`;
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
    rows.push(...parsePrPage(await response.json()));
    if (page === 1) {
      etag = response.headers.get("etag") ?? undefined;
    }
    url = nextPageUrl(response.headers);
  }

  return { kind: "rows", rows, etag };
}

/** GitHub pull-requests connector definition. */
export const githubPrsConnector: ConnectorDefinition<GithubPrsConfig> = {
  id: "github-prs",
  title: "GitHub pull requests",
  description: "Pull requests for a repository, grouped-ready by status.",
  icon: "tabler:IconGitPullRequest",
  configSchema: githubPrsConfigSchema,
  configFields: [
    {
      key: "owner",
      label: "Repository owner",
      placeholder: "octocat",
      kind: "text",
    },
    {
      key: "repo",
      label: "Repository name",
      placeholder: "hello-world",
      kind: "text",
    },
  ],
  fields() {
    return GITHUB_PR_FIELDS;
  },
  primarySourceKey: "title",
  fetchRows,
  pollPolicy: { minMs: MINUTE_MS, defaultMs: FIVE_MINUTES_MS },
};
