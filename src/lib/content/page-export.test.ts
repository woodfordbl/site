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
});
