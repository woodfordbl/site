import type { ComponentType, RefObject } from "react";

import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import type { BlockEditKeyboardProps } from "@/lib/editor/block-edit-props.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export type BlockMode = "view" | "edit";

export type BlockParent = BlockType | "canvas";

/** Renders a shell; children are separate rows. */
export type ContainerBlockType = "list" | "checklist";

/** Renders its own content via View + Edit. */
export type LeafBlockType = Exclude<BlockType, ContainerBlockType>;

export type BlockFor<T extends BlockType> = Extract<Block, { type: T }>;

export type PropsFor<T extends BlockType> = BlockFor<T>["props"];

export type EditStrategy =
  | "inline-text"
  | "inline-custom"
  | "composite"
  | "container";

export interface BlockCapabilities {
  blockIndent: boolean;
  focusAdjacent: boolean;
  rowSplit: boolean;
  slashMenu: boolean;
  structuralKeys: boolean;
}

export const INLINE_TEXT_CAPABILITIES: BlockCapabilities = {
  slashMenu: true,
  rowSplit: true,
  blockIndent: true,
  structuralKeys: true,
  focusAdjacent: true,
};

export interface ContainerDefinition {
  acceptEmptyMergeFromAfter: boolean;
  allowedChildTypes: BlockType[] | "*";
  defaultChildType: BlockType;
  insertSiblingOnEnter: boolean;
  onCaretStartChildEnter?: "lift-out" | "insert-sibling";
  onDisallowedChildConversion: "lift-out" | "prevent";
  onEmptyChildDelete: "lift-out" | "delete";
  onEmptyChildEnter: "lift-out" | "insert-sibling";
}

export interface BlockBehavior<T extends BlockType> {
  capabilities: BlockCapabilities;
  editStrategy: EditStrategy;
  isEmpty: (block: BlockFor<T>) => boolean;
}

export interface BlockViewProps<T extends LeafBlockType> {
  className?: string;
  props: PropsFor<T>;
}

export interface BlockEditPropsBase<T extends LeafBlockType> {
  mode?: BlockMode;
  onChange: (props: PropsFor<T>) => void;
  props: PropsFor<T>;
}

export interface BlockEditProps<T extends LeafBlockType>
  extends BlockEditPropsBase<T>,
    BlockEditKeyboardProps {}

export interface BlockContainerProps {
  fieldRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  mode: BlockMode;
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  row: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}

export type BlockViewComponent<T extends LeafBlockType> = ComponentType<
  BlockViewProps<T>
>;

export type BlockEditComponent<T extends LeafBlockType> = ComponentType<
  BlockEditProps<T>
>;

/** Lazy getter avoids registry → ListView → BlockRenderer import cycle. */
export type BlockContainerComponent = () => ComponentType<BlockContainerProps>;

export interface BlockSpecBase<T extends BlockType> {
  allowedParents?: BlockParent[] | "canvas" | "*";
  behavior: BlockBehavior<T>;
  createDefault: () => BlockFor<T>;
  icon: ComponentType<{ className?: string }>;
  label: string;
  slashAliases: readonly string[];
  type: T;
}

export interface LeafBlockSpec<T extends LeafBlockType>
  extends BlockSpecBase<T> {
  Edit: BlockEditComponent<T>;
  View: BlockViewComponent<T>;
}

export interface ContainerBlockSpec<T extends ContainerBlockType>
  extends BlockSpecBase<T> {
  Container: BlockContainerComponent;
  container: ContainerDefinition;
}

export type BlockSpec<T extends BlockType> = T extends LeafBlockType
  ? LeafBlockSpec<T>
  : T extends ContainerBlockType
    ? ContainerBlockSpec<T>
    : never;

export interface SlashMenuItem {
  aliases: string[];
  headingLevel?: 1 | 2 | 3 | 4;
  icon: ComponentType<{ className?: string }>;
  id: BlockType;
  key: string;
  keywords: string[];
  label: string;
  listVariant?: "bullet" | "ordered";
}

export function isLeafBlockType(type: BlockType): type is LeafBlockType {
  return type !== "list" && type !== "checklist";
}

export function isContainerBlockType(
  type: BlockType
): type is ContainerBlockType {
  return type === "list" || type === "checklist";
}

export function isLeafSpec(spec: {
  type: BlockType;
}): spec is LeafBlockSpec<LeafBlockType> {
  return isLeafBlockType(spec.type);
}

export function isContainerSpec(spec: {
  type: BlockType;
}): spec is ContainerBlockSpec<ContainerBlockType> {
  return isContainerBlockType(spec.type);
}

export function resolveContainerComponent(
  spec: ContainerBlockSpec<ContainerBlockType>
): ComponentType<BlockContainerProps> {
  return spec.Container();
}
