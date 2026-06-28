import { strFromU8, strToU8, unzip, zip } from "fflate";
import { z } from "zod";

/** Identifies archives produced by this app so import can reject foreign zips. */
export const WORKSPACE_ARCHIVE_APP = "personal-site";
/** Bump when the on-disk archive layout changes incompatibly. */
export const WORKSPACE_ARCHIVE_VERSION = 1;

export const WORKSPACE_MANIFEST_PATH = "manifest.json";
export const WORKSPACE_PAGES_DIR = "pages/";
export const WORKSPACE_MEDIA_DIR = "media/";

export interface WorkspaceArchiveMediaEntry {
  assetId: string;
  /** Path within the archive, e.g. `media/<assetId>.<ext>`. */
  file: string;
  mimeType: string;
}

export interface WorkspaceArchiveManifest {
  app: string;
  /** Present on every export; optional so older/partial archives still parse. */
  exportedAt?: string;
  media: WorkspaceArchiveMediaEntry[];
  pageCount?: number;
  version: number;
}

const workspaceArchiveMediaEntrySchema = z.object({
  assetId: z.string(),
  file: z.string(),
  mimeType: z.string(),
});

/** Lenient on unknown keys so older/newer minor archives still parse. */
export const workspaceArchiveManifestSchema = z.object({
  app: z.string(),
  exportedAt: z.string().optional(),
  media: z.array(workspaceArchiveMediaEntrySchema).default([]),
  pageCount: z.number().optional(),
  version: z.number(),
});

export function pageArchivePath(pageId: string): string {
  return `${WORKSPACE_PAGES_DIR}${pageId}.json`;
}

export function mediaArchivePath(assetId: string, extension: string): string {
  return `${WORKSPACE_MEDIA_DIR}${assetId}.${extension}`;
}

export function encodeJsonEntry(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

export function decodeTextEntry(bytes: Uint8Array): string {
  return strFromU8(bytes);
}

/** Async (worker-backed) zip so large media never blocks the main thread. */
export function zipWorkspace(
  files: Record<string, Uint8Array>
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

export function unzipWorkspace(
  bytes: Uint8Array
): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}
