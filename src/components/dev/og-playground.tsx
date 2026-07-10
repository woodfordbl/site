import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { OG_VARIANTS } from "@/lib/og/og-cards.ts";

/**
 * Dev-only playground for the /api/og social cards: every design variant
 * rendered by the real Satori endpoint (not a CSS replica), with editable
 * content and stress presets. Tweak src/lib/og/og-cards.ts and hit Re-render
 * — the Nitro route hot-reloads, and the cache-bust param defeats the
 * endpoint's immutable Cache-Control.
 */

interface CardContent {
  desc: string;
  icon: string;
  title: string;
}

const PRESETS: { content: CardContent; label: string }[] = [
  {
    label: "Typical page",
    content: {
      title: "Building a personal Notion from scratch",
      desc: "Blocks, databases, live queries and a rich-text canvas — notes on the architecture behind this site.",
      icon: "🏔️",
    },
  },
  {
    label: "Long title",
    content: {
      title:
        "Rebinding every hotkey with a registry-driven TanStack setup, then persisting user overrides to the database",
      desc: "",
      icon: "",
    },
  },
  {
    label: "Short + no desc",
    content: { title: "Dither charts", desc: "", icon: "📈" },
  },
  {
    label: "Home default",
    content: { title: "", desc: "", icon: "" },
  },
];

function ogUrl(variantId: string, content: CardContent, bust: number): string {
  const params = new URLSearchParams();
  params.set("variant", variantId);
  if (content.title) {
    params.set("title", content.title);
  }
  if (content.desc) {
    params.set("desc", content.desc);
  }
  if (content.icon) {
    params.set("icon", content.icon);
  }
  params.set("_", String(bust));
  return `/api/og?${params.toString()}`;
}

function VariantCard({
  bust,
  content,
  label,
  note,
  variantId,
}: {
  bust: number;
  content: CardContent;
  label: string;
  note: string;
  variantId: string;
}) {
  const url = useMemo(
    () => ogUrl(variantId, content, bust),
    [variantId, content, bust]
  );
  const [bytes, setBytes] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Fetch the size alongside the <img> so the WhatsApp 600 KB budget stays
  // visible while tweaking. Same URL — served from the browser cache.
  useEffect(() => {
    let cancelled = false;
    setBytes(null);
    setFailed(false);
    fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!cancelled) {
          if (blob) {
            setBytes(blob.size);
          } else {
            setFailed(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <img
        alt={`${label} social card preview`}
        className="h-auto w-full rounded-lg border shadow-sm"
        height={630}
        src={url}
        style={{ aspectRatio: "1200 / 630" }}
        width={1200}
      />
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {label}{" "}
          <span className="font-normal text-muted-foreground text-xs">
            {note}
          </span>
        </span>
        <span className="font-mono text-muted-foreground text-xs">
          {failed ? "render failed" : null}
          {bytes === null || failed ? null : `${Math.round(bytes / 1024)} KB`}
          {" · "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            variant={variantId}
          </a>
        </span>
      </figcaption>
    </figure>
  );
}

function IconAssets() {
  const assets = [
    { label: "prod", src: "/favicon.svg", sizes: [64, 32, 16] },
    { label: "preview", src: "/favicon-preview.svg", sizes: [64, 32, 16] },
    { label: "dev", src: "/favicon-dev.svg", sizes: [64, 32, 16] },
    { label: "apple-touch-icon", src: "/apple-touch-icon.png", sizes: [64] },
    { label: "maskable", src: "/icon-512-maskable.png", sizes: [64] },
  ];
  return (
    <div className="flex flex-wrap items-end gap-8">
      {assets.map((asset) => (
        <div className="flex flex-col gap-2" key={asset.label}>
          <div className="flex items-end gap-3">
            {asset.sizes.map((size) => (
              <img
                alt={`${asset.label} at ${size}px`}
                height={size}
                key={size}
                src={asset.src}
                style={{ width: size, height: size }}
                width={size}
              />
            ))}
          </div>
          <span className="font-mono text-muted-foreground text-xs">
            {asset.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OgPlayground() {
  const [content, setContent] = useState<CardContent>(PRESETS[0].content);
  const [bust, setBust] = useState(() => Date.now());

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          OG card playground
        </h1>
        <p className="text-muted-foreground text-sm">
          Live Satori renders from <code>/api/og</code>. Designs live in{" "}
          <code>src/lib/og/og-cards.ts</code>; edit and hit Re-render. The
          production default is <code>{OG_VARIANTS[0].label}</code>.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              onClick={() => {
                setContent(preset.content);
                setBust(Date.now());
              }}
              size="sm"
              variant="outline"
            >
              {preset.label}
            </Button>
          ))}
          <Button
            className="ml-auto"
            onClick={() => setBust(Date.now())}
            size="sm"
          >
            Re-render
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-title">Title</Label>
            <Input
              id="og-title"
              onChange={(event) =>
                setContent((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="Blake Woodford (default)"
              value={content.title}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-desc">Description</Label>
            <Input
              id="og-desc"
              onChange={(event) =>
                setContent((prev) => ({ ...prev, desc: event.target.value }))
              }
              placeholder="(none)"
              value={content.desc}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="og-icon">Icon</Label>
            <Input
              id="og-icon"
              onChange={(event) =>
                setContent((prev) => ({ ...prev, icon: event.target.value }))
              }
              placeholder="emoji"
              value={content.icon}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        {OG_VARIANTS.map((variant) => (
          <VariantCard
            bust={bust}
            content={content}
            key={variant.id}
            label={variant.label}
            note={variant.note}
            variantId={variant.id}
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg tracking-tight">App icons</h2>
        <p className="text-muted-foreground text-sm">
          Regenerate with <code>pnpm gen:icons</code> after editing{" "}
          <code>scripts/generate-icons.mjs</code>.
        </p>
        <IconAssets />
      </section>
    </div>
  );
}
