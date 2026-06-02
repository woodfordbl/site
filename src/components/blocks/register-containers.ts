import { registerContainerLoader } from "@/components/blocks/container-loaders.ts";
import { ChecklistView } from "@/components/blocks/types/checklist/checklist-view.tsx";
import { ListView } from "@/components/blocks/types/list/list-view.tsx";

registerContainerLoader("list", () => ListView);
registerContainerLoader("checklist", () => ChecklistView);
