/**
 * @fileoverview `/dev` showcase section for the mapcn map components.
 *
 * Loads `map-preview.tsx` through a dynamic `import()` so MapLibre (which
 * touches browser globals at import time) never enters the server graph.
 */
import { useEffect, useState } from "react";

import { Section } from "@/components/dev/showcase-section.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

type MapPreviewModule = typeof import("@/components/dev/map-preview.tsx");

function MapPreviewFallback() {
  return <div className="h-[320px] rounded-lg border bg-muted/40" />;
}

export function MapsSection({ isDark }: { isDark: boolean }) {
  const [preview, setPreview] = useState<MapPreviewModule | null>(null);

  // MapLibre touches browser globals at import time, so the preview module
  // loads on the client only — never in the server graph.
  useEffect(() => {
    import("@/components/dev/map-preview.tsx")
      .then((module) => {
        setPreview(module);
      })
      .catch(() => {
        /* client-only MapLibre bundle */
      });
  }, []);

  const theme = isDark ? "dark" : "light";

  return (
    <Section
      description="mapcn components (MapLibre GL) from @/components/ui/map."
      title="Maps"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Street basemap</CardTitle>
            <CardDescription>
              Default tiled basemap — streets, labels, and geographic context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              <preview.StreetMapPreview theme={theme} />
            ) : (
              <MapPreviewFallback />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blank canvas</CardTitle>
            <CardDescription>
              Tile-less canvas with world country polygons from GeoJSON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              <preview.BlankMapPreview theme={theme} />
            ) : (
              <MapPreviewFallback />
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
