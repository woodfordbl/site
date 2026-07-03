// Placeholder — replaced by the concurrent grid implementation; do not extend.
import type { ReactNode } from "react";

/** Props contract for the database grid rendered by `database` blocks. */
export interface DatabaseTableViewProps {
  databaseId: string;
  mode: "view" | "edit";
}

/** Table view for one workspace database (grid implementation pending). */
export function DatabaseTableView(_props: DatabaseTableViewProps): ReactNode {
  return null;
}
