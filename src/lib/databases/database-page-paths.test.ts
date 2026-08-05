import { describe, expect, it } from "vitest";
import {
  buildDatabaseHubSlug,
  buildDatabaseRowSlug,
  buildDatabaseTemplateSlug,
  resolveDatabasePathFromSplat,
  resolveDatabaseSlug,
  resolveRowSlug,
} from "./database-page-paths.ts";

const database = {
  id: "db-1",
  name: "Project tracker",
  primaryFieldId: "title",
  fields: [{ id: "title", name: "Title", type: "text" as const }],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const row = {
  id: "row-1",
  databaseId: database.id,
  values: { title: "Launch site" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const pages = [
  {
    id: "host",
    slug: "/work/projects",
    title: "Projects",
    parentId: null,
    routeBy: "slug" as const,
  },
  {
    id: "row-page",
    slug: "/work/projects/project-tracker/launch-site",
    title: "Launch site",
    parentId: "hub",
  },
];
const blocks = [
  {
    pageId: "host",
    type: "database",
    props: { databaseId: database.id },
  },
];

describe("database page paths", () => {
  it("builds database and row paths from stable segments", () => {
    expect(resolveDatabaseSlug(database)).toBe("project-tracker");
    expect(resolveRowSlug(database, row)).toBe("launch-site");
    expect(buildDatabaseHubSlug("/work/projects", "project-tracker")).toBe(
      "/work/projects/project-tracker"
    );
    expect(
      buildDatabaseRowSlug("/work/projects", "project-tracker", "launch-site")
    ).toBe("/work/projects/project-tracker/launch-site");
    expect(buildDatabaseTemplateSlug("/work/projects", "project-tracker")).toBe(
      "/work/projects/project-tracker/template"
    );
  });

  it("resolves the longest hosted page prefix", () => {
    expect(
      resolveDatabasePathFromSplat("work/projects/project-tracker", {
        blocks,
        databases: [database],
        pages,
        rows: [row],
      })
    ).toMatchObject({ kind: "hub", database, host: pages[0] });
  });

  it("returns null for an unknown row slug", () => {
    expect(
      resolveDatabasePathFromSplat("work/projects/project-tracker/missing", {
        blocks,
        databases: [database],
        pages,
        rows: [row],
      })
    ).toBeNull();
  });

  it("keeps resolving the row path once the hub page is seeded", () => {
    // The hub page carries its own linked `database` block, and its id sorts
    // ahead of a shipped host id like `home`. Seeding it mid-open must not
    // hijack host resolution and drop the in-flight row URL to not-found.
    const hostPage = {
      id: "home",
      slug: "/",
      title: "Home",
      parentId: null,
      routeBy: "slug" as const,
    };
    const hubPage = {
      id: "0a3f-hub",
      slug: "/project-tracker",
      title: "Project tracker",
      parentId: "home",
      databaseSource: { databaseId: database.id },
      routeBy: "id" as const,
    };

    expect(
      resolveDatabasePathFromSplat("project-tracker/launch-site", {
        blocks: [
          {
            pageId: "home",
            type: "database",
            props: { databaseId: database.id },
          },
          {
            pageId: hubPage.id,
            type: "database",
            props: { databaseId: database.id },
          },
        ],
        databases: [database],
        pages: [hostPage, hubPage],
        rows: [row],
      })
    ).toMatchObject({ kind: "row", host: hostPage, row });
  });

  it("resolves template and row paths", () => {
    expect(
      resolveDatabasePathFromSplat("work/projects/project-tracker/template", {
        blocks,
        databases: [database],
        pages,
        rows: [row],
      })
    ).toMatchObject({ kind: "template" });
    expect(
      resolveDatabasePathFromSplat(
        "work/projects/project-tracker/launch-site",
        {
          blocks,
          databases: [database],
          pages,
          rows: [row],
        }
      )
    ).toMatchObject({ kind: "row", row });
  });
});
