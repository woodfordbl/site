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
 * GitHub issues connector: one row per issue for a repo, newest-updated first,
 * following `Link rel="next"` pagination up to {@link MAX_PAGES} pages
 * ({@link MAX_PAGES} × 100 issues). Same direct-from-browser conditional-GET
 * discipline as `github-prs` and `github-repos`.
 *
 * The list endpoint also returns pull requests; rows with a `pull_request` field
 * are filtered out so PRs stay on the pull-requests connector. The `state`
 * column is a **select** with static open/closed options for status grouping.
 *
 * `labels` and `assignees` are **text** (comma-separated names/logins) because
 * option sets are open-ended — the sync engine only writes row values, not schema.
 */

const githubIssuesConfigSchema = z.object({
  /** Repository owner (user or organization login). */
  owner: z.string().min(1),
  /** Repository name. */
  repo: z.string().min(1),
  /** GitHub list filter; "all" includes closed issues. */
  state: z.enum(["all", "open"]).default("all"),
});

type GithubIssuesConfig = z.infer<typeof githubIssuesConfigSchema>;

/** The subset of the REST issue list payload this connector maps. */
const githubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  user: z.object({ login: z.string() }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
  assignees: z.array(z.object({ login: z.string() })),
  comments: z.number(),
  pull_request: z.unknown().optional(),
});

const githubIssueListSchema = z.array(githubIssueSchema);

/** Option ids double as the cell values `toConnectorRow` emits. */
const ISSUE_STATE_OPTIONS = [
  { id: "open", name: "Open", color: "green" },
  { id: "closed", name: "Closed", color: "red" },
] as const;

const GITHUB_ISSUE_FIELDS: ConnectorFieldDef[] = [
  {
    sourceKey: "title",
    name: "Title",
    type: "text",
    icon: "tabler:IconCircleDot",
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
    options: [...ISSUE_STATE_OPTIONS],
    icon: "tabler:IconProgress",
  },
  {
    sourceKey: "labels",
    name: "Labels",
    type: "text",
    icon: "tabler:IconTags",
  },
  {
    sourceKey: "assignees",
    name: "Assignees",
    type: "text",
    icon: "tabler:IconUsers",
  },
  {
    sourceKey: "comments",
    name: "Comments",
    type: "number",
    numberFormat: "integer",
    icon: "tabler:IconMessageCircle",
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
];

const ISO_DATE_PART_LENGTH = 10;

const MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;

/**
 * Pagination cap: up to 3 pages × 100 issues = 300 issues per snapshot. Same
 * bounded-poll policy as the pull-requests connector.
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

function parseConfig(config: Record<string, unknown>): GithubIssuesConfig {
  const parsed = githubIssuesConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid GitHub issues connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function joinNames(items: { name: string }[]): string | null {
  if (items.length === 0) {
    return null;
  }
  return items.map((item) => item.name).join(", ");
}

function joinLogins(items: { login: string }[]): string | null {
  if (items.length === 0) {
    return null;
  }
  return items.map((item) => item.login).join(", ");
}

function toConnectorRow(
  issue: z.infer<typeof githubIssueSchema>
): ConnectorRow {
  return {
    externalId: String(issue.id),
    values: {
      title: issue.title,
      number: issue.number,
      author: issue.user?.login ?? null,
      state: issue.state === "open" ? "open" : "closed",
      labels: joinNames(issue.labels),
      assignees: joinLogins(issue.assignees),
      comments: issue.comments,
      createdAt: issue.created_at.slice(0, ISO_DATE_PART_LENGTH),
      updatedAt: issue.updated_at.slice(0, ISO_DATE_PART_LENGTH),
      url: issue.html_url,
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
function parseIssuePage(payload: unknown): ConnectorRow[] {
  const parsed = githubIssueListSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ConnectorError("Unexpected GitHub response shape", {
      kind: "network",
      cause: parsed.error,
    });
  }
  return parsed.data
    .filter((issue) => issue.pull_request === undefined)
    .map(toConnectorRow);
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { owner, repo, state } = parseConfig(ctx.config);
  const firstUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${state}&sort=updated&direction=desc&per_page=100`;
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
    rows.push(...parseIssuePage(await response.json()));
    if (page === 1) {
      etag = response.headers.get("etag") ?? undefined;
    }
    url = nextPageUrl(response.headers);
  }

  return { kind: "rows", rows, etag };
}

/** GitHub issues connector definition. */
export const githubIssuesConnector: ConnectorDefinition<GithubIssuesConfig> = {
  id: "github-issues",
  title: "GitHub issues",
  description: "Issues for a repository, grouped-ready by status.",
  icon: "tabler:IconBug",
  configSchema: githubIssuesConfigSchema,
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
  auth: {
    kind: "token",
    label: "Personal access token",
    help: "Optional fine-grained PAT with read access to the repository. Raises the rate limit from 60 to 5,000 requests/hour; unchanged polls (304) are free. Tokens are stored per connector, so paste the same PAT you use for other GitHub connectors if you have one.",
    required: false,
  },
  fields() {
    return GITHUB_ISSUE_FIELDS;
  },
  primarySourceKey: "title",
  fetchRows,
  pollPolicy: { minMs: MINUTE_MS, defaultMs: FIVE_MINUTES_MS },
};
