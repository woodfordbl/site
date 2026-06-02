// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  DIRTY_PAGES_COOKIE_NAME,
  markPageClean,
  markPageDirty,
  parseDirtyPageIds,
  readDirtyPageIdsFromDocument,
  serializeDirtyPageIds,
} from "@/lib/local-draft/dirty-pages-cookie.ts";

function clearDirtyCookie(): void {
  document.cookie = `${DIRTY_PAGES_COOKIE_NAME}=; path=/; max-age=0`;
}

describe("parseDirtyPageIds", () => {
  it("returns an empty set for missing or blank values", () => {
    expect(parseDirtyPageIds(undefined).size).toBe(0);
    expect(parseDirtyPageIds("").size).toBe(0);
    expect(parseDirtyPageIds("   ").size).toBe(0);
  });

  it("parses single and multiple ids", () => {
    expect([...parseDirtyPageIds("home")]).toEqual(["home"]);
    expect([...parseDirtyPageIds("home,abc-123,def-456")]).toEqual([
      "home",
      "abc-123",
      "def-456",
    ]);
  });

  it("trims whitespace around ids", () => {
    expect([...parseDirtyPageIds(" home , abc ")]).toEqual(["home", "abc"]);
  });
});

describe("serializeDirtyPageIds", () => {
  it("round-trips through parse", () => {
    const ids = new Set(["home", "abc-123"]);
    expect(parseDirtyPageIds(serializeDirtyPageIds(ids))).toEqual(ids);
  });

  it("sorts ids for stable output", () => {
    expect(serializeDirtyPageIds(new Set(["z", "a", "m"]))).toBe("a,m,z");
  });
});

describe("markPageDirty", () => {
  afterEach(() => {
    clearDirtyCookie();
  });

  it("adds a page id once", () => {
    markPageDirty("home");
    expect([...readDirtyPageIdsFromDocument()]).toEqual(["home"]);

    markPageDirty("home");
    expect([...readDirtyPageIdsFromDocument()]).toEqual(["home"]);
  });

  it("accumulates multiple page ids", () => {
    markPageDirty("home");
    markPageDirty("notes");

    expect([...readDirtyPageIdsFromDocument()].sort()).toEqual([
      "home",
      "notes",
    ]);
  });
});

describe("markPageClean", () => {
  afterEach(() => {
    clearDirtyCookie();
  });

  it("removes a page id and deletes the cookie when empty", () => {
    markPageDirty("home");
    markPageDirty("notes");

    markPageClean("home");
    expect([...readDirtyPageIdsFromDocument()]).toEqual(["notes"]);

    markPageClean("notes");
    expect(readDirtyPageIdsFromDocument().size).toBe(0);
    expect(document.cookie.includes(DIRTY_PAGES_COOKIE_NAME)).toBe(false);
  });
});
