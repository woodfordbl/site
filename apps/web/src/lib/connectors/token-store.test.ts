import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getConnectorToken,
  setConnectorToken,
} from "@/lib/connectors/token-store.ts";

const STORAGE_KEY = "site-connector-tokens";

/** Minimal in-memory stand-in for the localStorage surface the store uses. */
class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe("token-store", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns undefined when no token is stored", () => {
    expect(getConnectorToken("github-repos")).toBeUndefined();
  });

  it("round-trips a token per connector id", () => {
    setConnectorToken("github-repos", "github_pat_secret");
    setConnectorToken("finnhub", "fh_key");
    expect(getConnectorToken("github-repos")).toBe("github_pat_secret");
    expect(getConnectorToken("finnhub")).toBe("fh_key");
  });

  it("clears a token when set to an empty or whitespace string", () => {
    setConnectorToken("github-repos", "github_pat_secret");
    setConnectorToken("github-repos", "  ");
    expect(getConnectorToken("github-repos")).toBeUndefined();
    // Last token removed → the storage key is deleted entirely.
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps other connectors' tokens when clearing one", () => {
    setConnectorToken("github-repos", "github_pat_secret");
    setConnectorToken("finnhub", "fh_key");
    setConnectorToken("github-repos", "");
    expect(getConnectorToken("github-repos")).toBeUndefined();
    expect(getConnectorToken("finnhub")).toBe("fh_key");
  });

  it("degrades corrupt stored JSON to empty and recovers on next write", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    expect(getConnectorToken("github-repos")).toBeUndefined();
    setConnectorToken("github-repos", "fresh");
    expect(getConnectorToken("github-repos")).toBe("fresh");
  });

  it("ignores non-string values in the stored record", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "github-repos": 42, finnhub: "fh_key" })
    );
    expect(getConnectorToken("github-repos")).toBeUndefined();
    expect(getConnectorToken("finnhub")).toBe("fh_key");
  });

  it("is a safe no-op without a window (SSR)", () => {
    vi.unstubAllGlobals();
    expect(getConnectorToken("github-repos")).toBeUndefined();
    expect(() => setConnectorToken("github-repos", "token")).not.toThrow();
  });
});
