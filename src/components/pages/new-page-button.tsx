import { IconPlus } from "@tabler/icons-react";

import { Button } from "@/components/ui/button.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";

function NewPageButtonLive() {
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);

  return (
    <Button
      className="w-full justify-start"
      onClick={() =>
        dispatch({ type: "page.create", title: DEFAULT_PAGE_TITLE })
      }
      size="sm"
      type="button"
      variant="ghost"
    >
      <IconPlus aria-hidden />
      New page
    </Button>
  );
}

export function NewPageButton() {
  const isClient = useIsClient();

  if (!isClient) {
    return null;
  }

  return <NewPageButtonLive />;
}
