import type { ComponentType } from "react";
import {
  type BlockFor,
  type ContainerBlockType,
  isContainerBlockType,
  isLeafBlockType,
  type LeafBlockType,
  type PropsFor,
} from "@/lib/blocks/block-defs.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockEditKeyboardProps } from "@/lib/editor/block-edit-props.ts";
import type { BlockType } from "@/lib/schemas/block.ts";

export type BlockMode = "view" | "edit";

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
  /**
   * Children render inside a `data-canvas-scope={rowId}` content wrapper, so
   * pointer features (marquee drill, overclick) can route into them. A
   * container declaring this must add the attribute to its content element.
   */
  scopedContent?: boolean;
  /**
   * Clicking or marqueeing the container selects its child rows as a unit,
   * and the shell highlights when every child is selected.
   */
  selectChildrenAsUnit?: boolean;
}

export interface BlockBehavior {
  capabilities: BlockCapabilities;
  editStrategy: EditStrategy;
}

export interface BlockViewProps<T extends LeafBlockType> {
  props: PropsFor<T>;
  /** Row context for views that need their place in the tree (e.g. heading collapse). */
  row?: CanvasRow;
}

export interface BlockEditPropsBase<T extends LeafBlockType> {
  mode?: BlockMode;
  onChange: (props: PropsFor<T>) => void;
  props: PropsFor<T>;
}

export interface BlockEditProps<T extends LeafBlockType>
  extends BlockEditPropsBase<T>,
    BlockEditKeyboardProps {
  /** Container type when this block renders inside a container (list item placeholders, etc.). */
  parentType?: BlockType;
  row?: CanvasRow;
}

export interface BlockContainerProps {
  mode: BlockMode;
  row: CanvasRow;
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
  behavior: BlockBehavior;
  createDefault: () => BlockFor<T>;
  icon: ComponentType<{ className?: string }>;
  label: string;
  slashAliases: readonly string[];
  /** Overrides the derived single slash item (multi-variant blocks: heading levels, list variants, column counts). */
  slashItems?: SlashMenuItem[];
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
  columnCount?: 2 | 3 | 4;
  headingLevel?: 1 | 2 | 3 | 4;
  icon: ComponentType<{ className?: string }>;
  id: BlockType;
  key: string;
  keywords: string[];
  label: string;
  listVariant?: "bullet" | "ordered";
  tabCount?: number;
  tableColumns?: number;
  tableRows?: number;
  toggleHeadingLevel?: 1 | 2 | 3 | 4;
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
