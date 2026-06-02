import type { ComponentType } from "react";

import type {
  BlockContainerComponent,
  BlockContainerProps,
  ContainerBlockType,
} from "@/lib/canvas/block-spec.types.ts";

const containerLoaders = new Map<ContainerBlockType, BlockContainerComponent>();

export function registerContainerLoader(
  type: ContainerBlockType,
  loader: BlockContainerComponent
): void {
  containerLoaders.set(type, loader);
}

export function resolveRegisteredContainer(
  type: ContainerBlockType
): ComponentType<BlockContainerProps> {
  const loader = containerLoaders.get(type);
  if (!loader) {
    throw new Error(`Container loader not registered for block type: ${type}`);
  }
  return loader();
}
