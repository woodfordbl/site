import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  canDeletePage,
  resolvePageDeleteTargets,
} from "@/lib/pages/page-delete.ts";

const pages: PageSummary[] = [
  { id: "home", slug: "/", title: "Home", parentId: null },
  { id: "work", slug: "/work", title: "Work", parentId: null },
  { id: "proj", slug: "/work/proj", title: "Project", parentId: "work" },
  { id: "notes", slug: "/notes", title: "Notes", parentId: null },
];

describe("canDeletePage", () => {
  it("blocks deleting home", () => {
    expect(canDeletePage("home", pages)).toBe(false);
  });

  it("blocks deleting the last remaining page", () => {
    const onlyHome = pages.filter((page) => page.id === "home");
    expect(canDeletePage("home", onlyHome)).toBe(false);
  });

  it("allows deleting when at least one page would remain", () => {
    expect(canDeletePage("notes", pages)).toBe(true);
  });

  it("blocks deleting work when it would remove every page except home via descendants", () => {
    const homeAndWork = pages.filter((page) =>
      ["home", "work", "proj"].includes(page.id)
    );
    expect(canDeletePage("work", homeAndWork)).toBe(true);
  });

  it("blocks deleting the only non-home page", () => {
    const homeAndNotes = pages.filter((page) =>
      ["home", "notes"].includes(page.id)
    );
    expect(canDeletePage("notes", homeAndNotes)).toBe(true);
    expect(canDeletePage("home", homeAndNotes)).toBe(false);

    const onlyNotes = [
      { id: "notes", slug: "/notes", title: "Notes", parentId: null },
    ];
    expect(canDeletePage("notes", onlyNotes)).toBe(false);
  });
});

describe("resolvePageDeleteTargets", () => {
  it("includes descendants", () => {
    expect(resolvePageDeleteTargets("work", pages)).toEqual(["work", "proj"]);
  });
});
