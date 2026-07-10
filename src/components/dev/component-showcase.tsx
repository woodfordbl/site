"use client";

import {
  IconArrowRight,
  IconArrowUpRight,
  IconBell,
  IconBold,
  IconCopy,
  IconDots,
  IconDownload,
  IconItalic,
  IconPhoto,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconUnderline,
  IconUser,
  IconWorld,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  // biome-ignore lint/suspicious/noDeprecatedImports: recharts still ships Cell for pie/bar fills
  Cell,
  Line,
  LineChart,
  XAxis,
} from "recharts";
import { toast } from "sonner";
import { editorFieldClassName } from "@/components/editor/editable-surface.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button, iconSlotClassName } from "@/components/ui/button.tsx";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  useChartDither,
} from "@/components/ui/chart.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { Kbd, KbdGroup } from "@/components/ui/kbd.tsx";
import { LinkUploadTabs } from "@/components/ui/link-upload-tabs.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { SequenceShortcut } from "@/components/ui/shortcut.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SourceLinkPanel } from "@/components/ui/source-link-panel.tsx";
import { SourceUploadPanel } from "@/components/ui/source-upload-panel.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  bodyTextClassName,
  bodyTextTypographyClassName,
  listMarkerCellClassName,
} from "@/lib/blocks/block-spacing.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import {
  CHART_PALETTE_TOKENS,
  CHART_PALETTES,
  type ChartPaletteId,
  chartPaletteIds,
} from "@/lib/charts/chart-palettes.ts";
import { pageTitleUnderlineClassName } from "@/lib/pages/page-link-display.ts";
import { cn } from "@/lib/utils.ts";

interface ColorToken {
  /** Foreground token used to render the sample glyph for paired swatches. */
  foreground?: string;
  /** CSS custom property name without the leading `--`. */
  name: string;
}

interface ColorGroup {
  label: string;
  tokens: ColorToken[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    label: "Surfaces",
    tokens: [
      { name: "background", foreground: "foreground" },
      { name: "card", foreground: "card-foreground" },
      { name: "popover", foreground: "popover-foreground" },
      { name: "muted", foreground: "muted-foreground" },
    ],
  },
  {
    label: "Brand & actions",
    tokens: [
      { name: "primary", foreground: "primary-foreground" },
      { name: "secondary", foreground: "secondary-foreground" },
      { name: "tertiary", foreground: "tertiary-foreground" },
      { name: "accent", foreground: "accent-foreground" },
      { name: "destructive", foreground: "background" },
    ],
  },
  {
    label: "Borders & rings",
    tokens: [{ name: "border" }, { name: "input" }, { name: "ring" }],
  },
  {
    label: "Sidebar",
    tokens: [
      { name: "sidebar", foreground: "sidebar-foreground" },
      { name: "sidebar-primary", foreground: "sidebar-primary-foreground" },
      { name: "sidebar-accent", foreground: "sidebar-accent-foreground" },
      { name: "sidebar-border" },
      { name: "sidebar-ring" },
    ],
  },
  {
    label: "Selection",
    tokens: [
      { name: "selection", foreground: "selection-foreground" },
      { name: "selection-primary", foreground: "foreground" },
    ],
  },
];

const ALL_TOKEN_NAMES = COLOR_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.name)
);

/** Sentence case: capitalize only the first letter, leave the rest as-is. */
function toSentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ColorSwatch({
  token,
  value,
}: {
  token: ColorToken;
  value: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-16 items-end justify-end rounded-lg p-1.5 ring-1 ring-foreground/10"
        style={{ backgroundColor: `var(--${token.name})` }}
      >
        {token.foreground ? (
          <span
            className="font-medium text-lg leading-none"
            style={{ color: `var(--${token.foreground})` }}
          >
            Ag
          </span>
        ) : null}
      </div>
      <div className="flex flex-col">
        <span className="font-medium text-foreground text-xs">
          --{token.name}
        </span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {value || "…"}
        </span>
      </div>
    </div>
  );
}

function Section({
  description,
  children,
  title,
}: {
  description?: string;
  children: React.ReactNode;
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

function ColorsSection({
  values,
}: {
  isDark: boolean;
  values: Record<string, string>;
}) {
  return (
    <Section
      description="Every semantic token in the OKLCH palette, resolved for the active theme."
      title="Colors"
    >
      <div className="flex flex-col gap-6">
        {COLOR_GROUPS.map((group) => (
          <div className="flex flex-col gap-3" key={group.label}>
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {group.label}
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {group.tokens.map((token) => (
                <ColorSwatch
                  key={token.name}
                  token={token}
                  value={values[token.name]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TypographyGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function TypographySection() {
  return (
    <Section
      description="Canvas block text styles — same Tailwind classes as production block views."
      title="Typography"
    >
      <div className="flex flex-col gap-8">
        <TypographyGroup>
          <h1
            className={cn(
              headingSurfaceClassName,
              headingTypographyClassNames[1]
            )}
          >
            Heading 1
          </h1>
          <h2
            className={cn(
              headingSurfaceClassName,
              headingTypographyClassNames[2]
            )}
          >
            Heading 2
          </h2>
          <h3
            className={cn(
              headingSurfaceClassName,
              headingTypographyClassNames[3]
            )}
          >
            Heading 3
          </h3>
          <h4
            className={cn(
              headingSurfaceClassName,
              headingTypographyClassNames[4]
            )}
          >
            Heading 4
          </h4>
        </TypographyGroup>

        <TypographyGroup>
          <p className={cn("text-pretty", bodyTextClassName)}>Body text</p>
          <span
            className={cn(
              editorFieldClassName,
              bodyTextTypographyClassName,
              "text-muted-foreground"
            )}
          >
            Type something, or press / for commands
          </span>
          <span
            className={cn(
              editorFieldClassName,
              headingTypographyClassNames[1],
              "text-muted-foreground"
            )}
          >
            Heading 1
          </span>
        </TypographyGroup>

        <TypographyGroup>
          <blockquote
            className={cn(
              "border-primary border-l-2 pl-4 italic",
              bodyTextClassName
            )}
          >
            Design is not just what it looks like — design is how it works.
          </blockquote>
        </TypographyGroup>

        <TypographyGroup>
          <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
            <div className={listMarkerCellClassName}>
              <span className={iconSlotClassName("icon-sm")}>💡</span>
            </div>
            <p className={cn("min-w-0 flex-1 text-pretty", bodyTextClassName)}>
              Callout
            </p>
          </div>
        </TypographyGroup>

        <TypographyGroup>
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className={cn(
                listMarkerCellClassName,
                "select-none text-muted-foreground leading-none"
              )}
            >
              •
            </span>
            <p className={cn("min-w-0 flex-1 text-pretty", bodyTextClassName)}>
              List
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className={cn(
                listMarkerCellClassName,
                "min-w-4 select-none text-muted-foreground tabular-nums leading-none"
              )}
            >
              1.
            </span>
            <p className={cn("min-w-0 flex-1 text-pretty", bodyTextClassName)}>
              List
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              aria-hidden
              checked={false}
              className="mt-1.5"
              disabled
              tabIndex={-1}
            />
            <span className={cn(bodyTextClassName, "min-w-0 flex-1")}>
              To-do
            </span>
          </div>
        </TypographyGroup>

        <TypographyGroup>
          <p className="text-lg leading-relaxed">
            <span className="inline-flex items-center gap-1.5 text-foreground hover:text-foreground/80">
              <span className={iconSlotClassName("default")}>📄</span>
              <span className={pageTitleUnderlineClassName}>Project notes</span>
              <IconArrowUpRight className="text-muted-foreground" />
            </span>
          </p>
          <p className="text-lg text-muted-foreground italic">Missing page</p>
        </TypographyGroup>

        <TypographyGroup>
          <table className="table-fixed border-collapse text-sm">
            <tbody>
              <tr>
                <td className="pr-4">
                  <span className="block min-w-0 whitespace-pre-wrap break-words">
                    Table cell
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-muted-foreground text-sm italic">
            Example embed title
          </p>
          <p className="text-muted-foreground text-sm">No URL provided</p>
        </TypographyGroup>
      </div>
    </Section>
  );
}

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "tertiary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;

function ButtonsSection() {
  return (
    <Section
      description="Variants, sizes, icon buttons, groups, and disabled states."
      title="Buttons"
    >
      <div className="flex flex-wrap items-center gap-3">
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {toSentenceCase(variant)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {BUTTON_SIZES.map((size) => (
          <Button key={size} size={size}>
            Size {size}
          </Button>
        ))}
        <Button disabled>Disabled</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {BUTTON_SIZES.map((size) => (
          <Button key={size} size={size} variant="outline">
            <IconPlus />
            Size {size}
          </Button>
        ))}
        <Button disabled variant="outline">
          <IconPlus />
          Disabled
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="icon-sm" variant="outline">
          <IconPlus />
        </Button>
        <Button size="icon" variant="outline">
          <IconSettings />
        </Button>
        <Button variant="outline">
          <IconDownload />
          Download
        </Button>
        <Button>
          Continue
          <IconArrowRight />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup>
          <Button variant="outline">
            <IconBold />
          </Button>
          <Button variant="outline">
            <IconItalic />
          </Button>
          <Button variant="outline">
            <IconUnderline />
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <ButtonGroupText>Page</ButtonGroupText>
          <ButtonGroupSeparator />
          <Button variant="outline">Prev</Button>
          <Button variant="outline">Next</Button>
        </ButtonGroup>
      </div>
    </Section>
  );
}

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "destructive",
] as const;

function BadgesSection() {
  return (
    <Section title="Badges">
      <div className="flex flex-wrap items-center gap-2">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {toSentenceCase(variant)}
          </Badge>
        ))}
        <Badge>
          <IconBell />
          With icon
        </Badge>
      </div>
    </Section>
  );
}

function FormsSection() {
  const [airplaneMode, setAirplaneMode] = useState(true);
  const [wifi, setWifi] = useState(false);
  const [terms, setTerms] = useState(true);
  const [newsletter, setNewsletter] = useState(false);

  return (
    <Section
      description="Inputs, textarea, input groups, switches, and checkboxes."
      title="Form controls"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Input placeholder="Email address" type="email" />
          <Input defaultValue="Read only" disabled />
          <Input aria-invalid="true" defaultValue="Invalid value" />
          <InputGroup>
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search…" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton>
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <Textarea placeholder="Write a short bio…" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <label
              className="flex items-center justify-between gap-3 text-sm"
              htmlFor="airplane-mode"
            >
              <span className="text-foreground">Airplane mode</span>
              <Switch
                checked={airplaneMode}
                id="airplane-mode"
                onCheckedChange={setAirplaneMode}
              />
            </label>
            <label
              className="flex items-center justify-between gap-3 text-sm"
              htmlFor="wifi"
            >
              <span className="text-foreground">Wi-Fi</span>
              <Switch checked={wifi} id="wifi" onCheckedChange={setWifi} />
            </label>
            <label
              className="flex items-center justify-between gap-3 text-muted-foreground text-sm"
              htmlFor="disabled-switch"
            >
              <span>Disabled</span>
              <Switch checked disabled id="disabled-switch" />
            </label>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="terms"
            >
              <Checkbox
                checked={terms}
                id="terms"
                onCheckedChange={(checked) => setTerms(checked === true)}
              />
              <span className="text-foreground">
                Accept terms and conditions
              </span>
            </label>
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="newsletter"
            >
              <Checkbox
                checked={newsletter}
                id="newsletter"
                onCheckedChange={(checked) => setNewsletter(checked === true)}
              />
              <span className="text-foreground">Subscribe to newsletter</span>
            </label>
            <label
              className="flex items-center gap-2.5 text-muted-foreground text-sm"
              htmlFor="disabled-check"
            >
              <Checkbox checked disabled id="disabled-check" />
              <span>Disabled checkbox</span>
            </label>
          </div>
        </div>
      </div>
    </Section>
  );
}

function RadioGroupsSection() {
  const [plan, setPlan] = useState("free");
  const [size, setSize] = useState("md");
  const [shipping, setShipping] = useState("");
  const shippingInvalid = shipping === "";

  return (
    <Section
      description="Single-selection groups in vertical and horizontal layouts, with disabled and validation states."
      title="Radio groups"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <span className="font-medium text-foreground text-sm">
            Choose a plan
          </span>
          <RadioGroup className="gap-2" onValueChange={setPlan} value={plan}>
            <label htmlFor="plan-free">
              <Item className="cursor-pointer" variant="outline">
                <ItemContent>
                  <ItemTitle>Free</ItemTitle>
                  <ItemDescription>$0/mo for personal projects</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <RadioGroupItem id="plan-free" value="free" />
                </ItemActions>
              </Item>
            </label>
            <label htmlFor="plan-pro">
              <Item className="cursor-pointer" variant="outline">
                <ItemContent>
                  <ItemTitle>Pro</ItemTitle>
                  <ItemDescription>
                    $12/mo with advanced features
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <RadioGroupItem id="plan-pro" value="pro" />
                </ItemActions>
              </Item>
            </label>
            <label htmlFor="plan-team">
              <Item className="cursor-pointer" variant="outline">
                <ItemContent>
                  <ItemTitle>Team</ItemTitle>
                  <ItemDescription>
                    $29/mo for shared workspaces
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <RadioGroupItem id="plan-team" value="team" />
                </ItemActions>
              </Item>
            </label>
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-medium text-foreground text-sm">Size</span>
          <RadioGroup
            className="flex flex-row flex-wrap gap-4"
            onValueChange={setSize}
            value={size}
          >
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="size-sm"
            >
              <RadioGroupItem id="size-sm" value="sm" />
              <span className="text-foreground">Small</span>
            </label>
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="size-md"
            >
              <RadioGroupItem id="size-md" value="md" />
              <span className="text-foreground">Medium</span>
            </label>
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="size-lg"
            >
              <RadioGroupItem id="size-lg" value="lg" />
              <span className="text-foreground">Large</span>
            </label>
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-medium text-muted-foreground text-sm">
            Disabled options
          </span>
          <RadioGroup defaultValue="standard">
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="shipping-standard"
            >
              <RadioGroupItem id="shipping-standard" value="standard" />
              <span className="text-foreground">Standard (5–7 days)</span>
            </label>
            <label
              className="flex items-center gap-2.5 text-muted-foreground text-sm"
              htmlFor="shipping-express"
            >
              <RadioGroupItem disabled id="shipping-express" value="express" />
              <span>Express (unavailable)</span>
            </label>
            <label
              className="flex items-center gap-2.5 text-muted-foreground text-sm"
              htmlFor="shipping-overnight"
            >
              <RadioGroupItem
                disabled
                id="shipping-overnight"
                value="overnight"
              />
              <span>Overnight (unavailable)</span>
            </label>
          </RadioGroup>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-foreground text-sm">
            Shipping method
          </legend>
          <RadioGroup onValueChange={setShipping} value={shipping}>
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="checkout-ground"
            >
              <RadioGroupItem
                aria-invalid={shippingInvalid}
                id="checkout-ground"
                value="ground"
              />
              <span className="text-foreground">Ground</span>
            </label>
            <label
              className="flex items-center gap-2.5 text-sm"
              htmlFor="checkout-priority"
            >
              <RadioGroupItem
                aria-invalid={shippingInvalid}
                id="checkout-priority"
                value="priority"
              />
              <span className="text-foreground">Priority</span>
            </label>
          </RadioGroup>
          {shippingInvalid ? (
            <p className="text-destructive text-sm">
              Select a shipping method to continue.
            </p>
          ) : null}
        </fieldset>
      </div>
    </Section>
  );
}

const PAGE_VIEWS = [
  { month: "Jan", desktop: 186, mobile: 80 },
  { month: "Feb", desktop: 305, mobile: 120 },
  { month: "Mar", desktop: 237, mobile: 98 },
  { month: "Apr", desktop: 273, mobile: 140 },
  { month: "May", desktop: 209, mobile: 110 },
  { month: "Jun", desktop: 214, mobile: 125 },
];

const pageViewsConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

/** Experiment: the Page views bar chart with ordered-dither textured fills. */
function DitheredPageViewsCard() {
  const dither = useChartDither(pageViewsConfig, { density: "medium" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Page views — dithered</CardTitle>
        <CardDescription>
          Same data, Bayer-dither textured fills
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="aspect-auto h-[240px] w-full"
          config={pageViewsConfig}
          palette="colorful"
        >
          <BarChart accessibilityLayer data={PAGE_VIEWS}>
            {dither.defs}
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="month"
              tickLine={false}
              tickMargin={8}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="desktop" fill={dither.fill("desktop")} radius={4} />
            <Bar dataKey="mobile" fill={dither.fill("mobile")} radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const TRAFFIC_TREND = [
  { month: "Jan", visitors: 1200, signups: 240 },
  { month: "Feb", visitors: 1450, signups: 310 },
  { month: "Mar", visitors: 1320, signups: 280 },
  { month: "Apr", visitors: 1680, signups: 360 },
  { month: "May", visitors: 1540, signups: 330 },
  { month: "Jun", visitors: 1720, signups: 390 },
];

const trafficTrendConfig = {
  visitors: {
    label: "Visitors",
    color: "var(--chart-3)",
  },
  signups: {
    label: "Signups",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const PALETTE_PREVIEW_DATA = [
  { slot: "1", value: 5 },
  { slot: "2", value: 4 },
  { slot: "3", value: 3 },
  { slot: "4", value: 2 },
  { slot: "5", value: 1 },
] as const;

const palettePreviewConfig = {
  value: { label: "Series", color: "var(--chart-1)" },
} satisfies ChartConfig;

function ChartPaletteSwatchRow({ paletteId }: { paletteId: ChartPaletteId }) {
  return (
    <div className="flex shrink-0 gap-1.5" data-chart-palette={paletteId}>
      {CHART_PALETTE_TOKENS.map((token) => (
        <div
          className="size-4 rounded-sm ring-1 ring-foreground/10"
          key={token}
          style={{ backgroundColor: `var(--${token})` }}
          title={`--${token}`}
        />
      ))}
    </div>
  );
}

function ChartPalettePreviewChart({
  paletteId,
}: {
  paletteId: ChartPaletteId;
}) {
  return (
    <ChartContainer
      className="aspect-auto h-16 w-full min-w-0 flex-1"
      config={palettePreviewConfig}
      palette={paletteId}
    >
      <BarChart accessibilityLayer data={[...PALETTE_PREVIEW_DATA]}>
        <Bar dataKey="value" radius={3}>
          {PALETTE_PREVIEW_DATA.map((entry, index) => (
            <Cell fill={`var(--chart-${index + 1})`} key={entry.slot} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function ChartPaletteRow({ paletteId }: { paletteId: ChartPaletteId }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
      data-chart-palette={paletteId}
    >
      <div className="flex min-w-28 items-center gap-3 sm:shrink-0">
        <span className="font-medium text-foreground text-sm">
          {CHART_PALETTES[paletteId].label}
        </span>
        <ChartPaletteSwatchRow paletteId={paletteId} />
      </div>
      <ChartPalettePreviewChart paletteId={paletteId} />
    </div>
  );
}

function ChartPalettesGallerySection() {
  return (
    <Section
      description="Mono palettes: chart-1 is the base — each step gets lighter (L↑) with a subtle chroma bump, not neon."
      title="Chart palettes"
    >
      <div className="flex flex-col gap-3">
        {chartPaletteIds().map((paletteId) => (
          <ChartPaletteRow key={paletteId} paletteId={paletteId} />
        ))}
      </div>
    </Section>
  );
}

function ChartsSection() {
  return (
    <>
      <ChartPalettesGallerySection />
      <Section
        description="Recharts wrapped in ChartContainer using the default colorful palette."
        title="Chart examples"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Page views</CardTitle>
              <CardDescription>
                Desktop vs mobile traffic by month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                className="aspect-auto h-[240px] w-full"
                config={pageViewsConfig}
                palette="colorful"
              >
                <BarChart accessibilityLayer data={PAGE_VIEWS}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="month"
                    tickLine={false}
                    tickMargin={8}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="desktop"
                    fill="var(--color-desktop)"
                    radius={4}
                  />
                  <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <DitheredPageViewsCard />

          <Card>
            <CardHeader>
              <CardTitle>Traffic trend</CardTitle>
              <CardDescription>Visitors and signups over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                className="aspect-auto h-[240px] w-full"
                config={trafficTrendConfig}
                palette="colorful"
              >
                <LineChart accessibilityLayer data={TRAFFIC_TREND}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="month"
                    tickLine={false}
                    tickMargin={8}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="visitors"
                    dot={false}
                    stroke="var(--color-visitors)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="signups"
                    dot={false}
                    stroke="var(--color-signups)"
                    strokeWidth={2}
                    type="monotone"
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </Section>
    </>
  );
}

function OverlaysSection() {
  const [notifications, setNotifications] = useState(true);
  const [sync, setSync] = useState(false);
  const [position, setPosition] = useState("bottom");

  return (
    <Section
      description="Dropdown menus, dialogs, popovers, and tooltips."
      title="Overlays"
    >
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            nativeButton
            render={
              <Button variant="outline">
                <IconUser />
                Account
                <IconDots />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>My account</DropdownMenuLabel>
              <DropdownMenuItem>
                <IconUser />
                Profile
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconSettings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Preferences</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>Appearance</DropdownMenuItem>
                  <DropdownMenuItem>Language</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={notifications}
              onCheckedChange={setNotifications}
            >
              Notifications
            </DropdownMenuCheckboxItem>
            <DropdownMenuSwitchItem checked={sync} onCheckedChange={setSync}>
              Sync data
            </DropdownMenuSwitchItem>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              onValueChange={setPosition}
              value={position}
            >
              <DropdownMenuLabel>Panel position</DropdownMenuLabel>
              <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bottom">
                Bottom
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <IconTrash />
              Delete account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog>
          <DialogTrigger
            render={<Button variant="outline">Open dialog</Button>}
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Make changes to your profile here. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Input defaultValue="Blake Woodford" placeholder="Name" />
              <Input defaultValue="blake@example.com" placeholder="Email" />
            </div>
            <DialogFooter showCloseButton>
              <Button>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Popover>
          <PopoverTrigger
            render={<Button variant="outline">Open popover</Button>}
          />
          <PopoverContent>
            <PopoverHeader>
              <PopoverTitle>Dimensions</PopoverTitle>
              <PopoverDescription>
                Set the dimensions for the layer.
              </PopoverDescription>
            </PopoverHeader>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-sm">Width</span>
              <Input className="h-7 w-24" defaultValue="100%" />
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger
            render={<Button variant="outline">Hover for tooltip</Button>}
          />
          <TooltipContent>
            <span>Add to library</span>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>E</Kbd>
            </KbdGroup>
          </TooltipContent>
        </Tooltip>
      </div>
    </Section>
  );
}

function demoToastAction(): void {
  // Showcase-only toast action — no side effects.
}

function ToastsSection() {
  const showPromiseSuccess = () => {
    toast.promise(
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("page data"), 1500);
      }),
      {
        loading: "Syncing changes…",
        success: (data) => `Loaded ${data}`,
        error: "Sync failed",
      }
    );
  };

  const showPromiseError = () => {
    toast.promise(
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("network")), 1500);
      }),
      {
        loading: "Saving…",
        success: "Saved",
        error: "Could not save — try again",
      }
    );
  };

  return (
    <Section
      description="Popover-aligned surface — icon top-left, close top-right, actions below aligned with text."
      title="Toasts"
    >
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <TabVariantColumn label="Types">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => toast.message("Event has been created")}
              variant="outline"
            >
              Default
            </Button>
            <Button
              onClick={() => toast.success("Saved successfully")}
              variant="outline"
            >
              Success
            </Button>
            <Button
              onClick={() =>
                toast.info("New version available — refresh to update")
              }
              variant="outline"
            >
              Info
            </Button>
            <Button
              onClick={() =>
                toast.warning("You have unsaved changes on this page")
              }
              variant="outline"
            >
              Warning
            </Button>
            <Button
              onClick={() => toast.error("Something went wrong")}
              variant="outline"
            >
              Error
            </Button>
            <Button
              onClick={() => toast.loading("Uploading file…")}
              variant="outline"
            >
              Loading
            </Button>
          </div>
        </TabVariantColumn>

        <TabVariantColumn label="Content">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                toast.info("Opening http://localhost:3000/ in Cursor Browser", {
                  cancel: {
                    label: "Don't show again",
                    onClick: demoToastAction,
                  },
                  action: {
                    label: "Don't open",
                    onClick: demoToastAction,
                  },
                })
              }
              variant="outline"
            >
              Reference layout
            </Button>
            <Button
              onClick={() =>
                toast.success("Profile updated", {
                  description: "Your changes are visible to collaborators.",
                })
              }
              variant="outline"
            >
              Description
            </Button>
            <Button
              onClick={() =>
                toast.message("File exported", {
                  action: {
                    label: "Open",
                    onClick: demoToastAction,
                  },
                })
              }
              variant="outline"
            >
              Action
            </Button>
            <Button
              onClick={() =>
                toast.message("Delete this page?", {
                  cancel: {
                    label: "Keep page",
                    onClick: demoToastAction,
                  },
                  action: {
                    label: "Delete",
                    onClick: demoToastAction,
                  },
                })
              }
              variant="outline"
            >
              Action + cancel
            </Button>
            <Button
              onClick={() =>
                toast.error('Local copy of "Draft" is no longer on the site', {
                  action: {
                    label: "Discard",
                    onClick: demoToastAction,
                  },
                  duration: Number.POSITIVE_INFINITY,
                })
              }
              variant="outline"
            >
              Persistent + action
            </Button>
          </div>
        </TabVariantColumn>

        <TabVariantColumn label="Async">
          <div className="flex flex-wrap gap-2">
            <Button onClick={showPromiseSuccess} variant="outline">
              Promise success
            </Button>
            <Button onClick={showPromiseError} variant="outline">
              Promise error
            </Button>
          </div>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

function TabVariantColumn({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

function TabsSection() {
  return (
    <Section
      description="All variants share a sliding indicator; pill and line differ in surface styling."
      title="Tabs"
    >
      <div className="flex flex-wrap items-stretch gap-6">
        <TabVariantColumn label="Indicator (default)">
          <Tabs defaultValue="one">
            <TabsList>
              <TabsTrigger value="one">Overview</TabsTrigger>
              <TabsTrigger value="two">Activity</TabsTrigger>
              <TabsTrigger value="three">Reports</TabsTrigger>
            </TabsList>
          </Tabs>
        </TabVariantColumn>

        <Separator className="self-stretch" orientation="vertical" />

        <TabVariantColumn label="Pill">
          <Tabs defaultValue="one">
            <TabsList variant="default">
              <TabsTrigger value="one">Overview</TabsTrigger>
              <TabsTrigger value="two">Activity</TabsTrigger>
              <TabsTrigger value="three">Reports</TabsTrigger>
            </TabsList>
          </Tabs>
        </TabVariantColumn>

        <Separator className="self-stretch" orientation="vertical" />

        <TabVariantColumn label="Line">
          <Tabs defaultValue="one">
            <TabsList variant="line">
              <TabsTrigger value="one">Overview</TabsTrigger>
              <TabsTrigger value="two">Activity</TabsTrigger>
              <TabsTrigger value="three">Reports</TabsTrigger>
            </TabsList>
          </Tabs>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section title="Cards">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project Aurora</CardTitle>
            <CardDescription>
              A design system built on OKLCH color tokens.
            </CardDescription>
            <CardAction>
              <Button size="icon-sm" variant="ghost">
                <IconDots />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Cards compose a header, content, and footer with consistent spacing
            and a subtle ring.
          </CardContent>
          <CardFooter className="justify-between">
            <Badge variant="secondary">Active</Badge>
            <Button size="sm">
              View
              <IconArrowRight />
            </Button>
          </CardFooter>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Compact card</CardTitle>
            <CardDescription>Smaller padding via size="sm".</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Storage</span>
              <span className="font-medium text-foreground">42.6 GB</span>
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

interface InvoiceRow {
  amount: string;
  invoice: string;
  method: string;
  status: string;
}

const INVOICES: InvoiceRow[] = [
  {
    invoice: "INV-001",
    status: "Paid",
    method: "Credit Card",
    amount: "$250.00",
  },
  {
    invoice: "INV-002",
    status: "Pending",
    method: "PayPal",
    amount: "$150.00",
  },
  {
    invoice: "INV-003",
    status: "Unpaid",
    method: "Bank Transfer",
    amount: "$350.00",
  },
];

function TableSection() {
  const compactInvoices = INVOICES.slice(0, 2);
  const invoiceTotal = INVOICES.reduce(
    (sum, row) => sum + Number.parseFloat(row.amount.replace(/[$,]/g, "")),
    0
  );

  return (
    <Section
      description="Default card-wrapped table and a compact striped layout with footer."
      title="Table"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <TabVariantColumn label="Default">
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {INVOICES.map((row) => (
                  <TableRow key={row.invoice}>
                    <TableCell className="font-medium">{row.invoice}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.method}
                    </TableCell>
                    <TableCell className="text-right">{row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabVariantColumn>

        <TabVariantColumn label="Compact & striped">
          <Card className="overflow-hidden p-0">
            <Table className="text-xs">
              <TableCaption>Recent invoices</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 px-2">Invoice</TableHead>
                  <TableHead className="h-8 px-2">Status</TableHead>
                  <TableHead className="h-8 px-2 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compactInvoices.map((row, index) => (
                  <TableRow
                    className={index % 2 === 1 ? "bg-muted/40" : undefined}
                    key={row.invoice}
                  >
                    <TableCell className="px-2 py-1.5 font-medium">
                      {row.invoice}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">
                      <Badge className="text-[10px]" variant="outline">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right">
                      {row.amount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right">
                    ${invoiceTotal.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

function KbdSection() {
  return (
    <Section
      description="Outline keycaps everywhere; default variant for inline confirm actions; char + char sequences use then."
      title="Keyboard hints"
    >
      <div className="flex flex-col gap-6">
        <TabVariantColumn label="Outline (default)">
          <div className="flex flex-wrap items-center gap-2">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
            <Kbd>Esc</Kbd>
            <Kbd>Enter</Kbd>
            <Kbd>Tab</Kbd>
          </div>
        </TabVariantColumn>

        <TabVariantColumn label="Default (inline confirm)">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" type="button" variant="ghost">
              Cancel
              <Kbd data-icon="inline-end" variant="default">
                Esc
              </Kbd>
            </Button>
            <Button size="sm" type="button" variant="destructive">
              Delete
              <Kbd data-icon="inline-end" variant="default">
                ↵
              </Kbd>
            </Button>
          </div>
        </TabVariantColumn>

        <div className="flex flex-wrap items-center gap-6">
          <TabVariantColumn label="Modifier combo">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>P</Kbd>
            </KbdGroup>
          </TabVariantColumn>

          <Separator className="h-6" orientation="vertical" />

          <TabVariantColumn label="Char + char sequence">
            <SequenceShortcut sequence={["G", "M"]} />
          </TabVariantColumn>

          <Separator className="h-6" orientation="vertical" />

          <TabVariantColumn label="Common shortcuts">
            <div className="flex flex-wrap items-center gap-3">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>E</Kbd>
              </KbdGroup>
              <KbdGroup>
                <Kbd>⇧</Kbd>
                <Kbd>⌘</Kbd>
                <Kbd>P</Kbd>
              </KbdGroup>
            </div>
          </TabVariantColumn>
        </div>

        <TabVariantColumn label="Sequence tooltip">
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline">Go to my issues</Button>}
            />
            <TooltipContent>
              Go to my issues
              <SequenceShortcut sequence={["G", "M"]} />
            </TooltipContent>
          </Tooltip>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

function SeparatorsSection() {
  return (
    <Section
      description="Horizontal and vertical dividers for grouped content."
      title="Separators"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <TabVariantColumn label="Horizontal">
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <span className="text-foreground text-sm">Notifications</span>
            <Separator />
            <span className="text-foreground text-sm">Privacy</span>
            <Separator />
            <span className="text-foreground text-sm">Account</span>
          </div>
        </TabVariantColumn>

        <TabVariantColumn label="Vertical">
          <div className="flex h-10 items-center gap-4 rounded-lg border px-4">
            <span className="text-foreground text-sm">Overview</span>
            <Separator className="h-6" orientation="vertical" />
            <span className="text-foreground text-sm">Activity</span>
            <Separator className="h-6" orientation="vertical" />
            <span className="text-foreground text-sm">Reports</span>
          </div>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

function PlaceholderTriggerSection() {
  return (
    <Section
      description="Muted canvas empty-state triggers and source-picker popovers for media and embed blocks."
      title="Placeholder trigger"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TabVariantColumn label="Triggers">
          <div className="flex flex-col gap-2">
            <PlaceholderTrigger icon={<IconWorld />}>
              Embed files and supported websites
            </PlaceholderTrigger>
            <PlaceholderTrigger icon={<IconPhoto />}>
              Add an image
            </PlaceholderTrigger>
          </div>
        </TabVariantColumn>

        <TabVariantColumn label="Source picker popovers">
          <div className="flex flex-col gap-3">
            <Popover>
              <PopoverTrigger
                render={
                  <PlaceholderTrigger icon={<IconWorld />}>
                    Embed files and supported websites
                  </PlaceholderTrigger>
                }
              />
              <PopoverContent className="w-80">
                <SourceLinkPanel
                  onSubmit={() => undefined}
                  placeholder="Paste in https://…"
                  submitLabel="Embed link"
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger
                render={
                  <PlaceholderTrigger icon={<IconPhoto />}>
                    Add an image, gif, or video
                  </PlaceholderTrigger>
                }
              />
              <PopoverContent className="w-80">
                <LinkUploadTabs
                  linkPanel={
                    <SourceLinkPanel
                      onSubmit={() => undefined}
                      placeholder="https://example.com/image.png"
                      submitLabel="Insert link"
                    />
                  }
                  uploadPanel={
                    <SourceUploadPanel onFileSelect={() => undefined} />
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

function EmptySection() {
  return (
    <Section
      description="Bordered action state and minimal dashed placeholder."
      title="Empty state"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TabVariantColumn label="Icon & action">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCopy />
              </EmptyMedia>
              <EmptyTitle>No items yet</EmptyTitle>
              <EmptyDescription>
                Create your first item to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm">
                <IconPlus />
                New item
              </Button>
            </EmptyContent>
          </Empty>
        </TabVariantColumn>

        <TabVariantColumn label="Minimal">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="default">
                <IconSearch />
              </EmptyMedia>
              <EmptyTitle>Nothing here</EmptyTitle>
              <EmptyDescription>
                Try adjusting your filters or search query.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </TabVariantColumn>
      </div>
    </Section>
  );
}

export function ComponentShowcase() {
  const [isDark, setIsDark] = useState(false);
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);

    const styles = getComputedStyle(root);
    const next: Record<string, string> = {};
    for (const name of ALL_TOKEN_NAMES) {
      next[name] = styles.getPropertyValue(`--${name}`).trim();
    }
    setTokenValues(next);

    return () => {
      root.classList.remove("dark");
    };
  }, [isDark]);

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading font-semibold text-2xl text-foreground tracking-tight">
              Design System
            </h1>
            <p className="text-muted-foreground text-sm">
              OKLCH tokens and component showcase.
            </p>
          </div>
          <label
            className="flex items-center gap-2.5 text-sm"
            htmlFor="theme-toggle"
          >
            <span className="text-muted-foreground">Light</span>
            <Switch
              checked={isDark}
              id="theme-toggle"
              onCheckedChange={setIsDark}
            />
            <span className="text-muted-foreground">Dark</span>
          </label>
        </header>

        <ColorsSection isDark={isDark} values={tokenValues} />
        <Separator />
        <TypographySection />
        <Separator />
        <ButtonsSection />
        <Separator />
        <BadgesSection />
        <Separator />
        <FormsSection />
        <Separator />
        <RadioGroupsSection />
        <Separator />
        <ChartsSection />
        <Separator />
        <OverlaysSection />
        <Separator />
        <ToastsSection />
        <Separator />
        <TabsSection />
        <Separator />
        <CardsSection />
        <Separator />
        <TableSection />
        <Separator />
        <KbdSection />
        <Separator />
        <SeparatorsSection />
        <Separator />
        <PlaceholderTriggerSection />
        <Separator />
        <EmptySection />
      </div>
    </main>
  );
}
