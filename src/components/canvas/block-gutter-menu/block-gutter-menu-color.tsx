import { IconPaint } from "@tabler/icons-react";
import { BlockColorSwatch } from "@/components/canvas/block-color-swatch.tsx";
import { useBlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  BLOCK_COLOR_DEFS,
  BLOCK_COLOR_IDS,
} from "@/lib/blocks/block-colors.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

const DEFAULT_VALUE = "default";

/** Notion-style block Color submenu: text color + background color. */
export function BlockGutterMenuColor() {
  const {
    blockBackgroundColor,
    blockColor,
    handleSetBlockBackground,
    handleSetBlockColor,
    supportsBlockColor,
  } = useBlockGutterMenu();

  if (!supportsBlockColor) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconPaint />
        Color
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        align="center"
        className="min-w-56"
        data-canvas-row-menu
      >
        {/* Labels must sit inside a Group (Base UI GroupLabel requirement). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Text color</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              handleSetBlockColor(
                value === DEFAULT_VALUE ? undefined : (value as BlockColor)
              );
            }}
            value={blockColor ?? DEFAULT_VALUE}
          >
            <DropdownMenuRadioItem value={DEFAULT_VALUE}>
              <BlockColorSwatch color={undefined} variant="text" />
              Default text
            </DropdownMenuRadioItem>
            {BLOCK_COLOR_IDS.map((color) => (
              <DropdownMenuRadioItem key={color} value={color}>
                <BlockColorSwatch color={color} variant="text" />
                {BLOCK_COLOR_DEFS[color].label} text
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Background color</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              handleSetBlockBackground(
                value === DEFAULT_VALUE ? undefined : (value as BlockColor)
              );
            }}
            value={blockBackgroundColor ?? DEFAULT_VALUE}
          >
            <DropdownMenuRadioItem value={DEFAULT_VALUE}>
              <BlockColorSwatch color={undefined} variant="background" />
              Default background
            </DropdownMenuRadioItem>
            {BLOCK_COLOR_IDS.map((color) => (
              <DropdownMenuRadioItem key={color} value={color}>
                <BlockColorSwatch color={color} variant="background" />
                {BLOCK_COLOR_DEFS[color].label} background
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
