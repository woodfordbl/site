// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { syncPageUrl } from "@/lib/pages/sync-url.ts";

describe("syncPageUrl", () => {
  afterEach(() => {
    window.history.replaceState(window.history.state, "", "/");
  });

  it("maps home slug to /", () => {
    syncPageUrl("/");

    expect(window.location.pathname).toBe("/");
  });

  it("maps nested slugs to path segments", () => {
    syncPageUrl("/about-me");

    expect(window.location.pathname).toBe("/about-me");
  });

  it("maps user page slugs to /p paths", () => {
    syncPageUrl("/new-page-2", { userPage: true });

    expect(window.location.pathname).toBe("/p/new-page-2");
  });
});
