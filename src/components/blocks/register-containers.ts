import { registerContainerLoader } from "@/components/blocks/container-loaders.ts";
import { ChecklistView } from "@/components/blocks/types/checklist/checklist-view.tsx";
import { ColumnContainer } from "@/components/blocks/types/columns/column-container.tsx";
import { ColumnsView } from "@/components/blocks/types/columns/columns-view.tsx";
import { ListView } from "@/components/blocks/types/list/list-view.tsx";
import { TableRowView } from "@/components/blocks/types/table/table-row-view.tsx";
import { TableView } from "@/components/blocks/types/table/table-view.tsx";

registerContainerLoader("list", () => ListView);
registerContainerLoader("checklist", () => ChecklistView);
registerContainerLoader("columns", () => ColumnsView);
registerContainerLoader("column", () => ColumnContainer);
registerContainerLoader("table", () => TableView);
registerContainerLoader("tableRow", () => TableRowView);
