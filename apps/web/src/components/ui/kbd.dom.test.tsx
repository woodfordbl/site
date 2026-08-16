/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Kbd } from "@/components/ui/kbd.tsx";

afterEach(cleanup);

describe("Kbd", () => {
  it("uses a filled muted surface with no border or ring for the default outline variant", () => {
    render(<Kbd>⌘</Kbd>);
    const el = screen.getByText("⌘");
    expect(el.getAttribute("data-slot")).toBe("kbd");
    expect(el.getAttribute("data-variant")).toBe("outline");
    expect(el.classList.contains("bg-muted")).toBe(true);
    expect(el.classList.contains("text-foreground")).toBe(true);
    expect(el.classList.contains("border")).toBe(false);
    expect(el.classList.contains("border-border")).toBe(false);
    expect([...el.classList].some((token) => token.startsWith("ring"))).toBe(
      false
    );
  });

  it("keeps the default (button-inline) variant filled without outline chrome", () => {
    render(<Kbd variant="default">Esc</Kbd>);
    const el = screen.getByText("Esc");
    expect(el.classList.contains("bg-muted")).toBe(true);
    expect(el.classList.contains("text-muted-foreground")).toBe(true);
    expect(el.classList.contains("border")).toBe(false);
    expect([...el.classList].some((token) => token.startsWith("ring"))).toBe(
      false
    );
  });

  it("keeps inherit as text-only with no filled chrome", () => {
    render(<Kbd variant="inherit">↵</Kbd>);
    const el = screen.getByText("↵");
    expect(el.classList.contains("text-inherit")).toBe(true);
    expect(el.classList.contains("bg-muted")).toBe(false);
    expect(el.classList.contains("border")).toBe(false);
  });
});
