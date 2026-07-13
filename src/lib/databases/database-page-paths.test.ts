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
