"use client";

import { IconWorld, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { isSyncedMode, syncContext } from "@/db/collections/sync-mode.ts";
import { usePageAccessLevel } from "@/hooks/use-page-access-level.ts";
import { authClient } from "@/lib/auth/auth-client.ts";
import {
  resolveShareRows,
  type ShareGrant,
  type ShareMember,
  type ShareRow,
} from "@/lib/pages/share-rows.ts";
import {
  ACCESS_LEVEL_LABELS,
  ACCESS_LEVELS,
  canManagePageSharing,
  isReadOnlyAccessLevel,
  type PageAccessLevel,
} from "@/lib/schemas/page-access.ts";

/**
 * @fileoverview Notion-style share dialog over `POST /api/pages/permissions`
 * plus the header chrome that opens it. Synced mode only: `PageShareControls`
 * renders nothing in local mode (no server, no other users), shows a
 * "View only" pill below `edit`, and shows the Share button only at
 * `full_access` (the endpoint enforces the same bar server-side). Every
 * mutation re-runs `list` — the dialog holds no derived state beyond the last
 * server response.
 */

interface ShareListState {
  grants: ShareGrant[];
  inheritPermissions: boolean;
  visibility: "private" | "workspace";
}

async function postPermissions(
  body: Record<string, unknown>
): Promise<ShareListState> {
  const response = await fetch("/api/pages/permissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Sharing request failed (${response.status})`);
  }
  return (await response.json()) as ShareListState;
}

async function fetchWorkspaceMembers(): Promise<ShareMember[]> {
  const workspaceId = syncContext.workspaceId;
  if (!workspaceId) {
    return [];
  }
  const result = await authClient.organization.listMembers({
    query: { organizationId: workspaceId },
  });
  const data = result.data as {
    members?: Array<{ user: { email: string; name: string }; userId: string }>;
  } | null;
  return (data?.members ?? []).map((member) => ({
    email: member.user.email,
    name: member.user.name,
    userId: member.userId,
  }));
}

function LevelSelect({
  ariaLabel,
  disabled,
  onChange,
  value,
}: {
  ariaLabel: string;
  disabled: boolean;
  onChange: (level: PageAccessLevel) => void;
  value: PageAccessLevel;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string" && next !== value) {
          onChange(next as PageAccessLevel);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label={ariaLabel} className="h-7 w-31 shrink-0">
        <SelectValue>
          {(current) =>
            ACCESS_LEVEL_LABELS[current as PageAccessLevel] ?? String(current)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ACCESS_LEVELS.map((level) => (
          <SelectItem key={level} value={level}>
            {ACCESS_LEVEL_LABELS[level]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GeneralAccessSection({
  busy,
  list,
  onSetInherit,
  onSetVisibility,
}: {
  busy: boolean;
  list: ShareListState;
  onSetInherit: (inherit: boolean) => void;
  onSetVisibility: (visibility: "private" | "workspace") => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium text-muted-foreground text-xs">
        General access
      </h3>
      <div className="flex items-center gap-2">
        <IconWorld
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 truncate text-sm">
          Everyone in workspace
        </span>
        <Select
          disabled={busy}
          onValueChange={(next) => {
            if (
              (next === "workspace" || next === "private") &&
              next !== list.visibility
            ) {
              onSetVisibility(next);
            }
          }}
          value={list.visibility}
        >
          <SelectTrigger
            aria-label="Page visibility"
            className="h-7 w-31 shrink-0"
          >
            <SelectValue>
              {(current) => (current === "private" ? "Private" : "Can access")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">Can access</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="min-w-0 flex-1">
          {list.inheritPermissions
            ? "Inherits access from parent"
            : "Restricted — access is set directly on this page"}
        </span>
        <Button
          disabled={busy}
          onClick={() => onSetInherit(!list.inheritPermissions)}
          size="xs"
          type="button"
          variant="outline"
        >
          {list.inheritPermissions ? "Restrict" : "Inherit from parent"}
        </Button>
      </div>
    </section>
  );
}

function GrantRow({
  busy,
  onRemove,
  onSetLevel,
  row,
}: {
  busy: boolean;
  onRemove: (row: ShareRow) => void;
  onSetLevel: (row: ShareRow, level: PageAccessLevel) => void;
  row: ShareRow;
}) {
  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{row.label}</p>
        {row.detail ? (
          <p className="truncate text-muted-foreground text-xs">{row.detail}</p>
        ) : null}
      </div>
      {row.inherited ? (
        <span
          className="shrink-0 text-muted-foreground text-xs"
          title="Inherited from a parent page — manage it there or restrict this page."
        >
          Inherited · {ACCESS_LEVEL_LABELS[row.level]}
        </span>
      ) : (
        <>
          <LevelSelect
            ariaLabel={`Access level for ${row.label}`}
            disabled={busy}
            onChange={(level) => onSetLevel(row, level)}
            value={row.level}
          />
          <Button
            aria-label={`Remove access for ${row.label}`}
            disabled={busy}
            onClick={() => onRemove(row)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IconX />
          </Button>
        </>
      )}
    </li>
  );
}

function AddPeopleRow({
  busy,
  members,
  onAdd,
}: {
  busy: boolean;
  members: ShareMember[];
  onAdd: (
    subject: { subjectId: string; subjectType: "user" | "workspace" },
    level: PageAccessLevel
  ) => void;
}) {
  const [subjectKey, setSubjectKey] = useState("workspace");
  const [level, setLevel] = useState<PageAccessLevel>("edit");

  const subjectLabel = (key: string): string => {
    if (key === "workspace") {
      return "Everyone in workspace";
    }
    const member = members.find((entry) => `user:${entry.userId}` === key);
    return member ? member.name || member.email : key;
  };

  const submit = () => {
    if (subjectKey === "workspace") {
      onAdd({ subjectId: "", subjectType: "workspace" }, level);
      return;
    }
    onAdd(
      { subjectId: subjectKey.slice("user:".length), subjectType: "user" },
      level
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        disabled={busy}
        onValueChange={(next) => {
          if (typeof next === "string") {
            setSubjectKey(next);
          }
        }}
        value={subjectKey}
      >
        <SelectTrigger aria-label="Who to share with" className="h-7 flex-1">
          <SelectValue>
            {(current) => subjectLabel(String(current ?? ""))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="workspace">Everyone in workspace</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={`user:${member.userId}`}>
              {member.name || member.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LevelSelect
        ariaLabel="Access level to grant"
        disabled={busy}
        onChange={setLevel}
        value={level}
      />
      <Button disabled={busy} onClick={submit} size="sm" type="button">
        Add
      </Button>
    </div>
  );
}

/**
 * The share dialog body. Mounted only while open so the initial `list` +
 * member fetch runs on mount; every action re-runs `list` to refresh.
 */
export function ShareDialog({
  onOpenChange,
  open,
  pageId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageId: string;
}) {
  const [list, setList] = useState<ShareListState | null>(null);
  const [members, setMembers] = useState<ShareMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList(await postPermissions({ action: "list", pageId }));
  }, [pageId]);

  useEffect(() => {
    refresh().catch(() => setError("Could not load sharing settings."));
    fetchWorkspaceMembers()
      .then(setMembers)
      .catch(() => undefined);
  }, [refresh]);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await postPermissions({ ...body, pageId });
        await refresh();
      } catch {
        setError("That change could not be saved.");
      } finally {
        setBusy(false);
      }
    },
    [pageId, refresh]
  );

  const rows = list ? resolveShareRows(list.grants, members) : [];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>
        {list ? (
          <div className="flex flex-col gap-4">
            <AddPeopleRow
              busy={busy}
              members={members}
              onAdd={(subject, level) =>
                run({ action: "set", level, ...subject })
              }
            />
            <section className="flex flex-col gap-2">
              <h3 className="font-medium text-muted-foreground text-xs">
                People with access
              </h3>
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <GrantRow
                    busy={busy}
                    key={row.key}
                    onRemove={(target) =>
                      run({
                        action: "remove",
                        subjectId: target.subjectId,
                        subjectType: target.subjectType,
                      })
                    }
                    onSetLevel={(target, level) =>
                      run({
                        action: "set",
                        level,
                        subjectId: target.subjectId,
                        subjectType: target.subjectType,
                      })
                    }
                    row={row}
                  />
                ))}
                {rows.length === 0 ? (
                  <li className="text-muted-foreground text-sm">
                    No direct grants — access comes from workspace roles.
                  </li>
                ) : null}
              </ul>
            </section>
            <GeneralAccessSection
              busy={busy}
              list={list}
              onSetInherit={(inherit) => run({ action: "setInherit", inherit })}
              onSetVisibility={(visibility) =>
                run({ action: "setVisibility", visibility })
              }
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {error ?? "Loading sharing settings…"}
          </p>
        )}
        {list && error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogButton({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        Share
      </Button>
      {open ? (
        <ShareDialog onOpenChange={setOpen} open={open} pageId={pageId} />
      ) : null}
    </>
  );
}

/**
 * Access-aware header chrome for one page: a "View only" pill below `edit`
 * and (on shareable surfaces) the Share button at `full_access`. Renders
 * nothing in local mode. `shareEnabled` is false on server/blog page surfaces,
 * which are not governed by page permissions.
 */
export function PageShareControls({
  pageId,
  shareEnabled,
}: {
  pageId: string;
  shareEnabled: boolean;
}) {
  const level = usePageAccessLevel(pageId);
  if (!isSyncedMode()) {
    return null;
  }
  return (
    <>
      {isReadOnlyAccessLevel(level) ? (
        <Badge variant="secondary">View only</Badge>
      ) : null}
      {shareEnabled && canManagePageSharing(level) ? (
        <ShareDialogButton pageId={pageId} />
      ) : null}
    </>
  );
}
