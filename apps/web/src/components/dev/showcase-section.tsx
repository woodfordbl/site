/**
 * @fileoverview Section shell for the `/dev` design-system showcase: a heading,
 * an optional description, and the section body.
 *
 * Its own module so sections extracted out of `component-showcase.tsx` can
 * reuse it without importing the showcase back (which would be circular).
 */
import type { ReactNode } from "react";

export function Section({
  description,
  children,
  title,
}: {
  description?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-semibold text-foreground text-lg">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
