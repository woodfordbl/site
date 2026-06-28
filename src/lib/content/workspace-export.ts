/**
 * Workspace `.zip` export (full workspace or single page).
 * @see docs/architecture/local-first-persistence.md#workspace-backup
 */
import { getAsset } from "@/db/assets/asset-store.ts";
import {
  collectWorkspacePage,
  collectWorkspacePages,
  type WorkspacePageCollection,
} from "@/lib/content/collect-workspace-pages.ts";
import {
  encodeJsonEntry,
  mediaArchivePath,
  pageArchivePath,
  WORKSPACE_ARCHIVE_APP,
  WORKSPACE_ARCHIVE_VERSION,
  WORKSPACE_MANIFEST_PATH,
  type WorkspaceArchiveManifest,
  type WorkspaceArchiveMediaEntry,
  zipWorkspace,
} from "@/lib/content/workspace-archive.ts";
import { extensionFromMimeType } from "@/lib/media/infer-media-kind.ts";

export interface WorkspaceExportResult {
  assetCount: number;
  /** Referenced assets whose blob was no longer in IndexedDB; excluded from the zip. */
  missingAssetIds: string[];
  pageCount: number;
}

async function buildArchive(collection: WorkspacePageCollection): Promise<{
  bytes: Uint8Array;
  result: WorkspaceExportResult;
}> {
  const { pages, assetIds } = collection;

  const files: Record<string, Uint8Array> = {};
  const media: WorkspaceArchiveMediaEntry[] = [];
  const missingAssetIds: string[] = [];

  for (const page of pages) {
    files[pageArchivePath(page.id)] = encodeJsonEntry(page);
  }

  for (const assetId of assetIds) {
    const blob = await getAsset(assetId);
    if (!blob) {
      missingAssetIds.push(assetId);
      continue;
    }
    const mimeType = blob.type || "application/octet-stream";
    const path = mediaArchivePath(assetId, extensionFromMimeType(blob.type));
    files[path] = new Uint8Array(await blob.arrayBuffer());
    media.push({ assetId, file: path, mimeType });
  }

  const manifest: WorkspaceArchiveManifest = {
    app: WORKSPACE_ARCHIVE_APP,
    exportedAt: new Date().toISOString(),
    media,
    pageCount: pages.length,
    version: WORKSPACE_ARCHIVE_VERSION,
  };
  files[WORKSPACE_MANIFEST_PATH] = encodeJsonEntry(manifest);

  const bytes = await zipWorkspace(files);
  return {
    bytes,
    result: {
      assetCount: media.length,
      missingAssetIds,
      pageCount: pages.length,
    },
  };
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadArchive(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Turns a page slug into a filename-safe stem (slugs can contain `/`). */
function fileSafeSlug(slug: string): string {
  const stem = slug.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return stem.toLowerCase() || "page";
}

/** Builds a full workspace snapshot zip and triggers a browser download. */
export async function exportWorkspaceArchive(): Promise<WorkspaceExportResult> {
  const { bytes, result } = await buildArchive(await collectWorkspacePages());
  downloadArchive(bytes, `personal-site-workspace-${todayStamp()}.zip`);
  return result;
}

/**
 * Exports a single page as the same archive format (re-importable via merge),
 * bundling only that page's media.
 */
export async function exportPageArchive(
  pageId: string
): Promise<WorkspaceExportResult> {
  const collection = await collectWorkspacePage(pageId);
  const { bytes, result } = await buildArchive(collection);
  const slug = collection.pages[0]?.slug ?? pageId;
  downloadArchive(bytes, `personal-site-page-${fileSafeSlug(slug)}.zip`);
  return result;
}
