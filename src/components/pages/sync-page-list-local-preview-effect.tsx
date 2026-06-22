import { useLayoutEffect } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { writePageListLocalPreviewFromPages } from "@/lib/pages/page-list-local-preview-cookie.ts";

/** Mirrors user page sidebar metadata into a cookie so SSR can render the page list. */
export function SyncPageListLocalPreviewEffect() {
  useLayoutEffect(() => {
    const sync = () => {
      if (!localPagesCollection.isReady()) {
        return;
      }

      writePageListLocalPreviewFromPages(localPagesCollection.toArray);
    };

    sync();

    const subscription = localPagesCollection.subscribeChanges(sync);
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
