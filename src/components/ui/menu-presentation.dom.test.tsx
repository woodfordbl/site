/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DrawerMenuTrigger,
  MenuDrawerRoot,
} from "@/components/ui/menu-presentation.tsx";

afterEach(cleanup);

describe("DrawerMenuTrigger", () => {
  it("opens the drawer even when the trigger's onClick preventDefaults", () => {
    // Mirrors the sidebar "⋯" menu, whose onClick preventDefaults/stopsPropagation
    // purely to stop the surrounding row from navigating. The drawer must still open
    // (parity with popover mode, where Base UI opens regardless of defaultPrevented).
    const onOpenChange = vi.fn();
    const onClick = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });

    render(
      <MenuDrawerRoot onOpenChange={onOpenChange} open={false}>
        <DrawerMenuTrigger onClick={onClick}>Open</DrawerMenuTrigger>
      </MenuDrawerRoot>
    );

    fireEvent.click(screen.getByText("Open"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("does not open when the render element's own onClick preventDefaults", () => {
    // e.g. a drag handle that suppresses the click — the render element opting out
    // should still short-circuit before the drawer opens.
    const onOpenChange = vi.fn();

    render(
      <MenuDrawerRoot onOpenChange={onOpenChange} open={false}>
        <DrawerMenuTrigger
          render={
            <button onClick={(event) => event.preventDefault()} type="button" />
          }
        >
          Open
        </DrawerMenuTrigger>
      </MenuDrawerRoot>
    );

    fireEvent.click(screen.getByText("Open"));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
