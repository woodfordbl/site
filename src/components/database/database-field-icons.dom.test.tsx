/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DATABASE_FIELD_TYPE_ICON_NODES,
  DATABASE_FIELD_TYPE_ICONS,
} from "@/components/database/database-field-icons.ts";
import type { DatabaseFieldType } from "@/lib/schemas/database.ts";

afterEach(cleanup);

/**
 * DATABASE_FIELD_TYPE_ICON_NODES is hand-copied Tabler node data (the
 * React-free source the CM6 property-chip widget draws from). This parity
 * check renders each React field-type icon and compares child-for-child, so
 * a Tabler upgrade or an icon swap in one map can't silently desync the two.
 */
describe("DATABASE_FIELD_TYPE_ICON_NODES", () => {
  it("matches the React field-type icons element-for-element", () => {
    const types = Object.keys(
      DATABASE_FIELD_TYPE_ICON_NODES
    ) as DatabaseFieldType[];
    for (const type of types) {
      const { container, unmount } = render(
        createElement(DATABASE_FIELD_TYPE_ICONS[type])
      );
      const rendered = [...container.querySelectorAll("svg > *")].map(
        (element) => [element.tagName.toLowerCase(), element.getAttribute("d")]
      );
      const expected = DATABASE_FIELD_TYPE_ICON_NODES[type].map(
        ([tag, attrs]) => [tag, attrs.d === undefined ? null : String(attrs.d)]
      );
      expect(rendered, `field type "${type}"`).toEqual(expected);
      unmount();
    }
  });
});
