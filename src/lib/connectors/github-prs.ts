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
 * first, one page (100 PRs) in v1. Same direct-from-browser conditional-GET
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
  { sourceKey: "title", name: "Title", type: "text" },
  {
    sourceKey: "number",
    name: "Number",
    type: "number",
    numberFormat: "integer",
  },
  { sourceKey: "author", name: "Author", type: "text" },
  {
    sourceKey: "state",
    name: "State",
    type: "select",
    options: [...PR_STATE_OPTIONS],
  },
  { sourceKey: "createdAt", name: "Created", type: "date" },
  { sourceKey: "updatedAt", name: "Updated", type: "date" },
  { sourceKey: "url", name: "URL", type: "url" },
  { sourceKey: "branch", name: "Branch", type: "text" },
];

const ISO_DATE_PART_LENGTH = 10;

const MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;

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

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { owner, repo, state } = parseConfig(ctx.config);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${state}&sort=updated&direction=desc&per_page=100`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (ctx.etag !== undefined) {
    headers["If-None-Match"] = ctx.etag;
  }
  if (ctx.token !== undefined) {
    headers.Authorization = `Bearer ${ctx.token}`;
  }
  let response: Response;
  try {
    response = await ctx.fetchFn(url, { headers });
  } catch (cause) {
    throw new ConnectorError("GitHub request failed", {
      kind: "network",
      cause,
    });
  }
  if (response.status === HTTP_STATUS_NOT_MODIFIED) {
    return { kind: "notModified" };
  }
  if (!response.ok) {
    throwForStatus(response);
  }
  const payload = githubPrListSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ConnectorError("Unexpected GitHub response shape", {
      kind: "network",
      cause: payload.error,
    });
  }
  return {
    kind: "rows",
    rows: payload.data.map(toConnectorRow),
    etag: response.headers.get("etag") ?? undefined,
  };
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
  auth: {
    kind: "token",
    label: "Personal access token",
    help: "Optional fine-grained PAT with read access to the repository. Raises the rate limit from 60 to 5,000 requests/hour; unchanged polls (304) are free. Tokens are stored per connector, so paste the same PAT you use for the GitHub repositories connector if you have one.",
    required: false,
  },
  fields() {
    return GITHUB_PR_FIELDS;
  },
  primarySourceKey: "title",
  fetchRows,
  pollPolicy: { minMs: MINUTE_MS, defaultMs: FIVE_MINUTES_MS },
};
