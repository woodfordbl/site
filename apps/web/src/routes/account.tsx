import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { syncContext } from "@/db/collections/sync-mode.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import {
  authClient,
  enterWorkspace,
  signOutToLocalMode,
} from "@/lib/auth/auth-client.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

/**
 * `/account` — accounts, workspaces, and membership for the synced mode.
 * Sign up / sign in (email + password), create workspaces (organizations),
 * invite members, accept invitations, and switch the active workspace. Auth
 * transitions set the `site-workspace` cookie and reload so the collection
 * layer boots into the right mode.
 */

export const Route = createFileRoute("/account")({
  head: () => ({ meta: buildNoIndexMeta("Account") }),
  component: AccountRoute,
});

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
}

interface MemberRow {
  id: string;
  role: string;
  user: { email: string; name: string };
}

interface InvitationRow {
  id: string;
  organizationId: string;
  organizationName?: string;
  role?: string | null;
  status: string;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "workspace"}-${crypto.randomUUID().slice(0, 6)}`;
}

function AccountRoute() {
  const isClient = useIsClient();
  if (!isClient) {
    return null;
  }
  return <AccountClient />;
}

function AccountClient() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-muted-foreground text-sm">
        Loading account…
      </main>
    );
  }
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="font-semibold text-2xl">Account</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {session
            ? `Signed in as ${session.user.email}`
            : "Create an account to sync your workspace in real time across devices and teammates."}
        </p>
      </header>
      {session ? <SignedIn /> : <AuthForms />}
    </main>
  );
}

function AuthForms() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      setBusy(false);
      return;
    }
    const sessionResult = await authClient.getSession();
    const active = sessionResult.data?.session.activeOrganizationId;
    if (active) {
      enterWorkspace(active);
      return;
    }
    window.location.reload();
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-2">
        <Button
          onClick={() => setMode("sign-up")}
          type="button"
          variant={mode === "sign-up" ? "default" : "outline"}
        >
          Create account
        </Button>
        <Button
          onClick={() => setMode("sign-in")}
          type="button"
          variant={mode === "sign-in" ? "default" : "outline"}
        >
          Sign in
        </Button>
      </div>
      {mode === "sign-up" && (
        <label className="flex flex-col gap-1 text-sm" htmlFor="account-name">
          Name
          <Input
            id="account-name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm" htmlFor="account-email">
        Email
        <Input
          id="account-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="account-password">
        Password
        <Input
          id="account-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button disabled={busy} type="submit">
        {mode === "sign-up" ? "Create account & workspace" : "Sign in"}
      </Button>
    </form>
  );
}

function SignedIn() {
  const activeWorkspaceId = syncContext.workspaceId;
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [orgsResult, invitesResult] = await Promise.all([
      authClient.organization.list(),
      authClient.organization.listUserInvitations(),
    ]);
    setOrganizations((orgsResult.data as OrganizationRow[] | null) ?? []);
    const invites = (invitesResult.data as InvitationRow[] | null) ?? [];
    setInvitations(invites.filter((invite) => invite.status === "pending"));
    if (activeWorkspaceId) {
      const membersResult = await authClient.organization.listMembers({
        query: { organizationId: activeWorkspaceId },
      });
      const data = membersResult.data as { members?: MemberRow[] } | null;
      setMembers(data?.members ?? []);
    }
    // activeWorkspaceId is boot-constant (module-scope sync context).
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openWorkspace = async (organizationId: string) => {
    await authClient.organization.setActive({ organizationId });
    enterWorkspace(organizationId);
  };

  const createWorkspace = async () => {
    const result = await authClient.organization.create({
      name: newWorkspace,
      slug: slugify(newWorkspace),
    });
    if (result.data) {
      setNewWorkspace("");
      await openWorkspace(result.data.id);
    }
  };

  const invite = async () => {
    if (!activeWorkspaceId) {
      return;
    }
    const result = await authClient.organization.inviteMember({
      email: inviteEmail,
      role: "member",
      organizationId: activeWorkspaceId,
    });
    setNotice(
      result.error
        ? (result.error.message ?? "Invitation failed")
        : `Invited ${inviteEmail} — they can accept from their /account page.`
    );
    setInviteEmail("");
  };

  const acceptInvitation = async (invitation: InvitationRow) => {
    const result = await authClient.organization.acceptInvitation({
      invitationId: invitation.id,
    });
    if (!result.error) {
      await openWorkspace(invitation.organizationId);
    }
  };

  const activeName = organizations.find(
    (org) => org.id === activeWorkspaceId
  )?.name;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-lg">Workspaces</h2>
        {activeWorkspaceId ? (
          <p className="text-muted-foreground text-sm">
            Active workspace: {activeName ?? activeWorkspaceId} — pages sync in
            real time for every member.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            No active workspace — open one below to start syncing.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {organizations.map((org) => (
            <li
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              key={org.id}
            >
              <span className="text-sm">
                {org.name}
                {org.id === activeWorkspaceId && (
                  <span className="ml-2 text-muted-foreground text-xs">
                    active
                  </span>
                )}
              </span>
              {org.id === activeWorkspaceId ? null : (
                <Button
                  onClick={() => openWorkspace(org.id)}
                  type="button"
                  variant="outline"
                >
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            createWorkspace();
          }}
        >
          <Input
            onChange={(event) => setNewWorkspace(event.target.value)}
            placeholder="New workspace name"
            required
            value={newWorkspace}
          />
          <Button type="submit">Create</Button>
        </form>
      </section>

      {invitations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-lg">Invitations</h2>
          <ul className="flex flex-col gap-2">
            {invitations.map((invitation) => (
              <li
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                key={invitation.id}
              >
                <span className="text-sm">
                  Join {invitation.organizationName ?? "a workspace"} as{" "}
                  {invitation.role ?? "member"}
                </span>
                <Button
                  onClick={() => acceptInvitation(invitation)}
                  type="button"
                >
                  Accept
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeWorkspaceId && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-lg">Members</h2>
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li className="text-sm" key={member.id}>
                {member.user.name} ({member.user.email}) —{" "}
                <span className="text-muted-foreground">{member.role}</span>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              invite();
            }}
          >
            <Input
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@email.com"
              required
              type="email"
              value={inviteEmail}
            />
            <Button type="submit">Invite</Button>
          </form>
          {notice && <p className="text-muted-foreground text-sm">{notice}</p>}
        </section>
      )}

      <section>
        <Button
          onClick={() => signOutToLocalMode()}
          type="button"
          variant="outline"
        >
          Sign out (back to local-only mode)
        </Button>
      </section>
    </div>
  );
}
