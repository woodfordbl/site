import { useEffect } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { writePageListLocalPreviewFromPages } from "@/lib/pages/page-list-local-preview-cookie.ts";

/** Mirrors user page sidebar metadata into a cookie so SSR can render the page list. */
export function SyncPageListLocalPreviewEffect() {
  useEffect(() => {
    const sync = () => {
      writePageListLocalPreviewFromPages(localPagesCollection.toArray);
    };

    sync();

    const subscription = localPagesCollection.subscribeChanges(sync);
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
