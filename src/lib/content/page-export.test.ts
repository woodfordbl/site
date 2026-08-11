import { describe, expect, it } from "vitest";

import { exportPageDocument } from "@/lib/content/page-export.ts";

describe("exportPageDocument", () => {
  it("includes icon when provided", () => {
    const doc = exportPageDocument([], {
      id: "home",
      slug: "/",
      title: "Home",
      parentId: null,
      icon: "🚀",
    });

    expect(doc.icon).toBe("🚀");
  });

  it("omits icon when not provided", () => {
    const doc = exportPageDocument([], {
      id: "home",
      slug: "/",
      title: "Home",
      parentId: null,
    });

    expect(doc).not.toHaveProperty("icon");
  });

  it("includes authored timestamps when provided", () => {
    const doc = exportPageDocument([], {
      id: "home",
      slug: "/",
      title: "Home",
      parentId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(doc.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(doc.updatedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("omits authored timestamps when not provided", () => {
    const doc = exportPageDocument([], {
      id: "home",
      slug: "/",
      title: "Home",
      parentId: null,
    });

    expect(doc).not.toHaveProperty("createdAt");
    expect(doc).not.toHaveProperty("updatedAt");
  });
});
