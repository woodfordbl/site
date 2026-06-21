// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  PAGE_LIST_EXPANDED_COOKIE_NAME,
  parsePageListExpandedIds,
  readPageListExpandedIdsFromDocument,
  serializePageListExpandedIds,
  writePageListExpandedIdsToDocument,
} from "@/lib/pages/page-list-expanded-cookie.ts";

function clearExpandedCookie(): void {
  document.cookie = `${PAGE_LIST_EXPANDED_COOKIE_NAME}=; path=/; max-age=0`;
}

describe("parsePageListExpandedIds", () => {
  it("returns an empty set for missing or blank values", () => {
    expect(parsePageListExpandedIds(undefined).size).toBe(0);
    expect(parsePageListExpandedIds("").size).toBe(0);
    expect(parsePageListExpandedIds("   ").size).toBe(0);
  });

  it("parses single and multiple ids", () => {
    expect([...parsePageListExpandedIds("parent-a")]).toEqual(["parent-a"]);
    expect([...parsePageListExpandedIds("parent-a,parent-b")]).toEqual([
      "parent-a",
      "parent-b",
    ]);
  });

  it("trims whitespace around ids", () => {
    expect([...parsePageListExpandedIds(" a , b ")]).toEqual(["a", "b"]);
  });
});

describe("serializePageListExpandedIds", () => {
  it("round-trips through parse", () => {
    const ids = new Set(["z-page", "a-page"]);
    expect(parsePageListExpandedIds(serializePageListExpandedIds(ids))).toEqual(
      ids
    );
  });

  it("sorts ids for stable output", () => {
    expect(serializePageListExpandedIds(new Set(["z", "a", "m"]))).toBe(
      "a,m,z"
    );
  });
});

describe("readPageListExpandedIdsFromDocument", () => {
  afterEach(() => {
    clearExpandedCookie();
  });

  it("reads expanded page ids from the cookie", () => {
    writePageListExpandedIdsToDocument(new Set(["work", "notes"]));
    expect(readPageListExpandedIdsFromDocument()).toEqual(
      new Set(["work", "notes"])
    );
  });

  it("removes the cookie when writing an empty set", () => {
    writePageListExpandedIdsToDocument(new Set(["work"]));
    writePageListExpandedIdsToDocument(new Set());
    expect(document.cookie.includes(PAGE_LIST_EXPANDED_COOKIE_NAME)).toBe(
      false
    );
    expect(readPageListExpandedIdsFromDocument().size).toBe(0);
  });
});
