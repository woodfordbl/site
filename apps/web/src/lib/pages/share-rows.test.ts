import { describe, expect, it } from "vitest";

import {
  resolveShareRows,
  type ShareGrant,
  type ShareMember,
} from "@/lib/pages/share-rows.ts";

const MEMBERS: ShareMember[] = [
  { email: "ada@example.com", name: "Ada", userId: "u-ada" },
  { email: "bob@example.com", name: "", userId: "u-bob" },
];

function grant(overrides: Partial<ShareGrant>): ShareGrant {
  return {
    inherited: false,
    level: "view",
    sourcePageId: "page-1",
    subjectId: "",
    subjectType: "workspace",
    ...overrides,
  };
}

describe("resolveShareRows", () => {
  it("labels workspace, member, and unknown-member subjects", () => {
    const rows = resolveShareRows(
      [
        grant({ subjectType: "workspace" }),
        grant({ subjectId: "u-ada", subjectType: "user", level: "edit" }),
        grant({ subjectId: "u-gone", subjectType: "user" }),
      ],
      MEMBERS
    );
    expect(rows.map((row) => row.label)).toEqual([
      "Everyone in workspace",
      "Ada",
      "Unknown member",
    ]);
    expect(rows[1]).toMatchObject({
      detail: "ada@example.com",
      level: "edit",
      subjectId: "u-ada",
    });
  });

  it("falls back to the email as label for a nameless member", () => {
    const rows = resolveShareRows(
      [grant({ subjectId: "u-bob", subjectType: "user" })],
      MEMBERS
    );
    expect(rows[0]).toMatchObject({ detail: null, label: "bob@example.com" });
  });

  it("labels group grants without a client-side group directory", () => {
    const rows = resolveShareRows(
      [grant({ subjectId: "0f9d2c1b-rest", subjectType: "group" })],
      MEMBERS
    );
    expect(rows[0]).toMatchObject({ detail: "Group", label: "Group 0f9d2c1b" });
  });

  it("keeps only the nearest chain node per subject (input is depth asc)", () => {
    const rows = resolveShareRows(
      [
        grant({
          subjectId: "u-ada",
          subjectType: "user",
          level: "full_access",
        }),
        grant({
          inherited: true,
          level: "view",
          sourcePageId: "parent",
          subjectId: "u-ada",
          subjectType: "user",
        }),
      ],
      MEMBERS
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ inherited: false, level: "full_access" });
  });

  it("lists direct grants before inherited ones", () => {
    const rows = resolveShareRows(
      [
        grant({
          inherited: true,
          sourcePageId: "parent",
          subjectType: "workspace",
        }),
        grant({ subjectId: "u-ada", subjectType: "user" }),
      ],
      MEMBERS
    );
    expect(rows.map((row) => row.inherited)).toEqual([false, true]);
  });
});
