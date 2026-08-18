import { describe, expect, it } from "vitest";

import {
  accessAtLeast,
  canManagePageSharing,
  isReadOnlyAccessLevel,
  myAccessRowSchema,
} from "@/lib/schemas/page-access.ts";

describe("accessAtLeast", () => {
  it("orders view < comment < edit < full_access", () => {
    expect(accessAtLeast("view", "comment")).toBe(false);
    expect(accessAtLeast("comment", "edit")).toBe(false);
    expect(accessAtLeast("edit", "full_access")).toBe(false);
    expect(accessAtLeast("full_access", "edit")).toBe(true);
    expect(accessAtLeast("edit", "comment")).toBe(true);
    expect(accessAtLeast("comment", "view")).toBe(true);
  });

  it("treats a level as at least itself", () => {
    expect(accessAtLeast("view", "view")).toBe(true);
    expect(accessAtLeast("full_access", "full_access")).toBe(true);
  });
});

describe("isReadOnlyAccessLevel", () => {
  it("marks view and comment read-only", () => {
    expect(isReadOnlyAccessLevel("view")).toBe(true);
    expect(isReadOnlyAccessLevel("comment")).toBe(true);
  });

  it("keeps edit and full_access editable", () => {
    expect(isReadOnlyAccessLevel("edit")).toBe(false);
    expect(isReadOnlyAccessLevel("full_access")).toBe(false);
  });

  it("treats an unknown (null) level as ungoverned, not read-only", () => {
    expect(isReadOnlyAccessLevel(null)).toBe(false);
  });
});

describe("canManagePageSharing", () => {
  it("requires exactly full_access", () => {
    expect(canManagePageSharing("full_access")).toBe(true);
    expect(canManagePageSharing("edit")).toBe(false);
    expect(canManagePageSharing("comment")).toBe(false);
    expect(canManagePageSharing("view")).toBe(false);
    expect(canManagePageSharing(null)).toBe(false);
  });
});

describe("myAccessRowSchema", () => {
  it("accepts a wire row and rejects unknown levels", () => {
    expect(myAccessRowSchema.parse({ pageId: "p1", level: "edit" })).toEqual({
      pageId: "p1",
      level: "edit",
    });
    expect(
      myAccessRowSchema.safeParse({ pageId: "p1", level: "owner" }).success
    ).toBe(false);
  });
});
