import { describe, expect, it } from "vitest";

import { buildSyncedDatabaseSeed } from "@/lib/connectors/build-synced-database.ts";
import { frankfurterRatesConnector } from "@/lib/connectors/frankfurter-rates.ts";
import { githubReposConnector } from "@/lib/connectors/github-repos.ts";
import { localDatabaseSchema } from "@/lib/schemas/database.ts";

describe("buildSyncedDatabaseSeed", () => {
  it("builds a schema-valid database with connector source and no rows", () => {
    const config = { username: "octocat" };
    const { database, rows } = buildSyncedDatabaseSeed(
      githubReposConnector,
      config
    );
    expect(rows).toEqual([]);
    expect(localDatabaseSchema.parse(database)).toBeTruthy();
    expect(database.source).toEqual({
      kind: "connector",
      connectorId: "github-repos",
      config,
    });
    expect(database.name).toBe(githubReposConnector.title);
    expect(database.icon).toBe(githubReposConnector.icon);
  });

  it("tags every field with its sourceKey and per-type config", () => {
    const { database } = buildSyncedDatabaseSeed(githubReposConnector, {
      username: "octocat",
    });
    expect(database.fields.map((field) => field.sourceKey)).toEqual([
      "name",
      "description",
      "stars",
      "forks",
      "language",
      "updatedAt",
      "url",
    ]);
    const stars = database.fields.find((field) => field.sourceKey === "stars");
    expect(stars?.type).toBe("number");
    expect(stars?.type === "number" ? stars.format : undefined).toBe("integer");
    const url = database.fields.find((field) => field.sourceKey === "url");
    expect(url?.type).toBe("url");
  });

  it("resolves primaryFieldId from primarySourceKey", () => {
    const { database } = buildSyncedDatabaseSeed(githubReposConnector, {
      username: "octocat",
    });
    const primary = database.fields.find(
      (field) => field.id === database.primaryFieldId
    );
    expect(primary?.sourceKey).toBe(githubReposConnector.primarySourceKey);
    expect(primary?.name).toBe("Name");
  });

  it("creates one default Table view", () => {
    const { database } = buildSyncedDatabaseSeed(frankfurterRatesConnector, {
      base: "USD",
    });
    expect(database.views).toHaveLength(1);
    expect(database.views[0].name).toBe("Table");
    expect(database.views[0].type).toBe("table");
  });

  it("honors an explicit name over the connector title", () => {
    const { database } = buildSyncedDatabaseSeed(
      frankfurterRatesConnector,
      { base: "EUR" },
      "FX watchlist"
    );
    expect(database.name).toBe("FX watchlist");
  });
});
