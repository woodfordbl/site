import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "node_modules/@tabler/icons-react/dist/esm/icons");

const candidates = [
  "IconFile",
  "IconFiles",
  "IconFileText",
  "IconFileDescription",
  "IconFilePlus",
  "IconFolder",
  "IconFolders",
  "IconFolderOpen",
  "IconNotebook",
  "IconNotes",
  "IconNote",
  "IconClipboard",
  "IconClipboardText",
  "IconReport",
  "IconReportAnalytics",
  "IconBook",
  "IconBook2",
  "IconBooks",
  "IconBookmark",
  "IconBookmarks",
  "IconLibrary",
  "IconWriting",
  "IconChecklist",
  "IconList",
  "IconListCheck",
  "IconListNumbers",
  "IconHome",
  "IconHome2",
  "IconUser",
  "IconUsers",
  "IconUserCircle",
  "IconUserPlus",
  "IconFriends",
  "IconMoodSmile",
  "IconMoodHappy",
  "IconStar",
  "IconStarFilled",
  "IconHeart",
  "IconHeartFilled",
  "IconThumbUp",
  "IconEye",
  "IconEyeOff",
  "IconBolt",
  "IconFlame",
  "IconBulb",
  "IconRocket",
  "IconTarget",
  "IconFlag",
  "IconFlag2",
  "IconTrophy",
  "IconAward",
  "IconMedal",
  "IconCrown",
  "IconDiamond",
  "IconGift",
  "IconConfetti",
  "IconSparkles",
  "IconStars",
  "IconBookmarkPlus",
  "IconBriefcase",
  "IconBuilding",
  "IconBuildingStore",
  "IconBuildingBank",
  "IconBuildingSkyscraper",
  "IconBuildingCommunity",
  "IconBuildingFactory",
  "IconSchool",
  "IconPresentation",
  "IconCertificate",
  "IconId",
  "IconBadge",
  "IconCalendar",
  "IconCalendarEvent",
  "IconCalendarTime",
  "IconClock",
  "IconClockHour4",
  "IconAlarm",
  "IconHourglass",
  "IconHistory",
  "IconTimeline",
  "IconStopwatch",
  "IconMail",
  "IconMailOpened",
  "IconInbox",
  "IconSend",
  "IconMessage",
  "IconMessage2",
  "IconMessageCircle",
  "IconMessages",
  "IconPhone",
  "IconPhoneCall",
  "IconBell",
  "IconBellRinging",
  "IconSpeakerphone",
  "IconAddressBook",
  "IconCamera",
  "IconPhoto",
  "IconVideo",
  "IconMovie",
  "IconMusic",
  "IconHeadphones",
  "IconMicrophone",
  "IconVolume",
  "IconPlayerPlay",
  "IconPlaylist",
  "IconBroadcast",
  "IconRadio",
  "IconDeviceTv",
  "IconVinyl",
  "IconCode",
  "IconCodeDots",
  "IconTerminal",
  "IconTerminal2",
  "IconBraces",
  "IconBrackets",
  "IconBinary",
  "IconCpu",
  "IconDatabase",
  "IconServer",
  "IconServer2",
  "IconCloud",
  "IconCloudUpload",
  "IconCloudDownload",
  "IconApi",
  "IconBug",
  "IconGitBranch",
  "IconGitCommit",
  "IconGitMerge",
  "IconGitPullRequest",
  "IconDeviceLaptop",
  "IconDeviceDesktop",
  "IconDeviceMobile",
  "IconDeviceTablet",
  "IconDeviceImac",
  "IconKeyboard",
  "IconMouse",
  "IconWifi",
  "IconBluetooth",
  "IconUsb",
  "IconPlug",
  "IconBattery",
  "IconBatteryCharging",
  "IconHexagons",
  "IconWorld",
  "IconWorldWww",
  "IconMap",
  "IconMap2",
  "IconMapPin",
  "IconCompass",
  "IconRoute",
  "IconGps",
  "IconLocation",
  "IconNavigation",
  "IconPlane",
  "IconCar",
  "IconBike",
  "IconBus",
  "IconTrain",
  "IconShip",
  "IconWalk",
  "IconRun",
  "IconLuggage",
  "IconMotorbike",
  "IconCoffee",
  "IconApple",
  "IconPizza",
  "IconBeer",
  "IconGlassFull",
  "IconCup",
  "IconSalad",
  "IconMeat",
  "IconCake",
  "IconIceCream",
  "IconBread",
  "IconEgg",
  "IconCheese",
  "IconToolsKitchen2",
  "IconBottle",
  "IconCandy",
  "IconShoppingCart",
  "IconShoppingBag",
  "IconCreditCard",
  "IconCash",
  "IconCoin",
  "IconCoins",
  "IconWallet",
  "IconReceipt",
  "IconCurrencyDollar",
  "IconCurrencyEuro",
  "IconPigMoney",
  "IconChartPie",
  "IconChartDonut",
  "IconBuildingWarehouse",
  "IconChartBar",
  "IconChartLine",
  "IconChartArea",
  "IconChartDots",
  "IconChartHistogram",
  "IconTrendingUp",
  "IconTrendingDown",
  "IconActivity",
  "IconGauge",
  "IconChartCandle",
  "IconSettings",
  "IconAdjustments",
  "IconTool",
  "IconTools",
  "IconHammer",
  "IconScrewdriver",
  "IconWand",
  "IconBrush",
  "IconPaint",
  "IconPalette",
  "IconPencil",
  "IconEdit",
  "IconEraser",
  "IconRuler",
  "IconScissors",
  "IconStamp",
  "IconColorSwatch",
  "IconBucket",
  "IconHighlight",
  "IconLink",
  "IconUnlink",
  "IconPaperclip",
  "IconPin",
  "IconPinned",
  "IconTag",
  "IconTags",
  "IconHash",
  "IconAt",
  "IconArchive",
  "IconFilter",
  "IconLayoutGrid",
  "IconLayoutList",
  "IconColumns",
  "IconStack",
  "IconStack2",
  "IconLock",
  "IconLockOpen",
  "IconKey",
  "IconShield",
  "IconShieldCheck",
  "IconShieldLock",
  "IconFingerprint",
  "IconPassword",
  "IconScan",
  "IconInfoCircle",
  "IconAlertCircle",
  "IconAlertTriangle",
  "IconCheck",
  "IconCircleCheck",
  "IconX",
  "IconCircleX",
  "IconQuestionMark",
  "IconHelp",
  "IconExclamationMark",
  "IconBan",
  "IconCircleDot",
  "IconPlus",
  "IconMinus",
  "IconSun",
  "IconMoon",
  "IconCloudRain",
  "IconCloudStorm",
  "IconSnowflake",
  "IconWind",
  "IconDroplet",
  "IconLeaf",
  "IconPlant",
  "IconPlant2",
  "IconTree",
  "IconTrees",
  "IconFlower",
  "IconMountain",
  "IconBeach",
  "IconWaveSine",
  "IconRainbow",
  "IconCat",
  "IconDog",
  "IconFish",
  "IconBird",
  "IconButterfly",
  "IconPaw",
  "IconHorse",
  "IconSpider",
  "IconBat",
  "IconBox",
  "IconPackage",
  "IconPackages",
  "IconBalloon",
  "IconFlashlight",
  "IconUmbrella",
  "IconBackpack",
  "IconShirt",
  "IconShoe",
  "IconGlasses",
  "IconHanger",
  "IconDeviceWatch",
  "IconBuildingLighthouse",
  "IconBuildingMonument",
  "IconBuildingCastle",
  "IconHeartbeat",
  "IconStethoscope",
  "IconPill",
  "IconVaccine",
  "IconFirstAidKit",
  "IconYoga",
  "IconBarbell",
  "IconWeight",
  "IconAbacus",
  "IconMath",
  "IconBrain",
  "IconMicroscope",
  "IconAtom",
  "IconFlask",
  "IconTestPipe",
  "IconBolt2",
  "IconBucketDroplet",
  "IconDeviceGamepad",
  "IconDeviceGamepad2",
  "IconDice",
  "IconChess",
  "IconPuzzle",
  "IconBallBasketball",
  "IconBallFootball",
  "IconBallTennis",
  "IconBallBaseball",
  "IconBallBowling",
  "IconChessKnight",
];

const valid = [
  ...new Set(
    candidates.filter((name) => existsSync(join(iconsDir, `${name}.mjs`)))
  ),
].sort((a, b) => a.localeCompare(b));

const catalog = `/** Curated Tabler icon names for the page icon picker (explicit imports in page-icon.ts). */
export const PAGE_ICON_TABLER_NAMES = [
${valid.map((name) => `  "${name}",`).join("\n")}
] as const;

export type PageIconTablerName = (typeof PAGE_ICON_TABLER_NAMES)[number];
`;

const pageIcon = `import {
${valid.map((name) => `  ${name},`).join("\n")}
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import {
  PAGE_ICON_TABLER_NAMES,
  type PageIconTablerName,
} from "@/lib/pages/page-icon-tabler-catalog.ts";

export const TABLER_PAGE_ICON_PREFIX = "tabler:" as const;

export type TablerPageIconComponent = ComponentType<{ className?: string }>;

export const TABLER_PAGE_ICONS: Record<
  PageIconTablerName,
  TablerPageIconComponent
> = {
${valid.map((name) => `  ${name},`).join("\n")}
};

export type DecodedPageIcon =
  | { kind: "default" }
  | { kind: "emoji"; value: string }
  | {
      kind: "tabler";
      name: PageIconTablerName;
      component: TablerPageIconComponent;
    };

/**
 * Encodes a curated Tabler icon name for \`localPagesCollection\` / shipped JSON (\`tabler:IconName\`).
 * @see docs/architecture/pages.md#page-icons
 */
export function formatTablerPageIcon(name: PageIconTablerName): string {
  return \`\${TABLER_PAGE_ICON_PREFIX}\${name}\`;
}

/**
 * Decodes stored page icon strings for \`PageIconDisplay\`. Unknown \`tabler:*\` values fall back to default.
 * @see docs/architecture/pages.md#page-icons
 */
export function decodePageIcon(raw?: string): DecodedPageIcon {
  if (raw == null || raw.length === 0) {
    return { kind: "default" };
  }

  if (raw.startsWith(TABLER_PAGE_ICON_PREFIX)) {
    const name = raw.slice(TABLER_PAGE_ICON_PREFIX.length);
    if (isPageIconTablerName(name)) {
      return {
        kind: "tabler",
        name,
        component: TABLER_PAGE_ICONS[name],
      };
    }
    return { kind: "default" };
  }

  return { kind: "emoji", value: raw };
}

function isPageIconTablerName(name: string): name is PageIconTablerName {
  return (PAGE_ICON_TABLER_NAMES as readonly string[]).includes(name);
}

export const DEFAULT_PAGE_ICON = IconFile;
`;

await writeFile(
  join(root, "src/lib/pages/page-icon-tabler-catalog.ts"),
  catalog
);
await writeFile(join(root, "src/lib/pages/page-icon.ts"), pageIcon);
console.log(`Wrote ${valid.length} icons to catalog + page-icon.ts`);
