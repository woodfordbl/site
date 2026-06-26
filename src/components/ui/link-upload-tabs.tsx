import { IconUpload, IconWorld } from "@tabler/icons-react";
import type * as React from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { cn } from "@/lib/utils.ts";

interface LinkUploadTabsProps {
  className?: string;
  defaultTab?: "link" | "upload";
  linkPanel: React.ReactNode;
  uploadPanel: React.ReactNode;
}

function LinkUploadTabs({
  defaultTab = "upload",
  linkPanel,
  uploadPanel,
  className,
}: LinkUploadTabsProps) {
  return (
    <Tabs className={cn("gap-0", className)} defaultValue={defaultTab}>
      <div className="relative w-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 border-border border-b"
        />
        <TabsList className="relative z-[1]" variant="line">
          <TabsTrigger value="link">
            <IconWorld />
            Link
          </TabsTrigger>
          <TabsTrigger value="upload">
            <IconUpload />
            Upload
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="mt-3 space-y-2" value="link">
        {linkPanel}
      </TabsContent>
      <TabsContent className="mt-3 space-y-2" value="upload">
        {uploadPanel}
      </TabsContent>
    </Tabs>
  );
}

export { LinkUploadTabs };
