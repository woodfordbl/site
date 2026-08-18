import type { PageAccessLevel } from "@/lib/schemas/page-access.ts";

/**
 * @fileoverview Pure mapping from the permissions endpoint's grant list
 * (`POST /api/pages/permissions`, action `list`) to the rows the share dialog
 * renders. The server returns the whole permission chain ordered nearest-first
 * (depth asc); one subject can therefore appear on several chain nodes, and
 * the nearest grant is the one the dialog shows and edits.
 */

/** One grant as returned by the permissions endpoint's `list` action. */
export interface ShareGrant {
  inherited: boolean;
  level: PageAccessLevel;
  sourcePageId: string;
  subjectId: string;
  subjectType: "user" | "group" | "workspace";
}

/** Workspace member identity used to label `user` grants. */
export interface ShareMember {
  email: string;
  name: string;
  userId: string;
}

/** One rendered row of the share dialog's grant list. */
export interface ShareRow {
  /** Secondary line (email for members); null when the label says it all. */
  detail: string | null;
  /** Inherited rows are read-only in the dialog (edited on the source page). */
  inherited: boolean;
  key: string;
  label: string;
  level: PageAccessLevel;
  subjectId: string;
  subjectType: ShareGrant["subjectType"];
}

function subjectLabel(
  grant: ShareGrant,
  members: ShareMember[]
): { detail: string | null; label: string } {
  if (grant.subjectType === "workspace") {
    return { detail: null, label: "Everyone in workspace" };
  }
  if (grant.subjectType === "group") {
    return { detail: "Group", label: `Group ${grant.subjectId.slice(0, 8)}` };
  }
  const member = members.find((entry) => entry.userId === grant.subjectId);
  if (!member) {
    return { detail: null, label: "Unknown member" };
  }
  return {
    detail: member.name ? member.email : null,
    label: member.name || member.email,
  };
}

/**
 * Maps the raw grant chain to display rows: one row per subject (the nearest
 * chain node wins — the input is ordered depth asc), direct grants listed
 * before inherited ones, labels resolved from the workspace member list.
 */
export function resolveShareRows(
  grants: ShareGrant[],
  members: ShareMember[]
): ShareRow[] {
  const seen = new Set<string>();
  const rows: ShareRow[] = [];
  for (const grant of grants) {
    const key = `${grant.subjectType}:${grant.subjectId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const { detail, label } = subjectLabel(grant, members);
    rows.push({
      detail,
      inherited: grant.inherited,
      key,
      label,
      level: grant.level,
      subjectId: grant.subjectId,
      subjectType: grant.subjectType,
    });
  }
  return [
    ...rows.filter((row) => !row.inherited),
    ...rows.filter((row) => row.inherited),
  ];
}
