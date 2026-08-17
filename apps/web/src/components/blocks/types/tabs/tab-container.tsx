import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";

import { TabView } from "./tab-view.tsx";

/** Container shell when a `tab` row is rendered via `BlockTreeNode` (normally nested in `TabsView`). */
export function TabContainer({ row, mode }: BlockContainerProps) {
  return <TabView mode={mode} tabRow={row} />;
}
