import { putAsset } from "@/db/assets/asset-store.ts";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { replacePageBlocks } from "@/db/queries/block-collection-ops.ts";
import {
  decodeTextEntry,
  unzipWorkspace,
  WORKSPACE_ARCHIVE_APP,
  WORKSPACE_ARCHIVE_VERSION,
  WORKSPACE_MANIFEST_PATH,
  WORKSPACE_PAGES_DIR,
  type WorkspaceArchiveManifest,
  workspaceArchiveManifestSchema,
} from "@/lib/content/workspace-archive.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";
import { resetAllToRemote } from "@/lib/pages/reset-all-to-remote.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import { type Page, pageSchema } from "@/lib/schemas/page.ts";

export type WorkspaceImportMode = "replace" | "merge";

export interface WorkspaceImportResult {
  importedPages: number;
  restoredAssets: number;
  /** Non-fatal issues (e.g. a missing media file). The import still applied. */
  warnings: string[];
}

/**
 * A fatal import failure. `errors` holds one human-readable line per problem so
 * the UI can show the full list — nothing is applied when this is thrown.
 */
export class WorkspaceImportError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors[0] ?? "Import failed.");
    this.name = "WorkspaceImportError";
    this.errors = errors;
  }
}

async function readArchive(file: File): Promise<Record<string, Uint8Array>> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new WorkspaceImportError(["Could not read the selected file."]);
  }

  try {
    return await unzipWorkspace(bytes);
  } catch {
    throw new WorkspaceImportError([
      "This file isn't a valid .zip archive — it may be corrupt or the wrong file.",
    ]);
  }
}

function parseManifest(
  files: Record<string, Uint8Array>
): WorkspaceArchiveManifest {
  const raw = files[WORKSPACE_MANIFEST_PATH];
  if (!raw) {
    throw new WorkspaceImportError([
      "Missing manifest.json — this doesn't look like a workspace archive.",
    ]);
  }

  let json: unknown;
  try {
    json = JSON.parse(decodeTextEntry(raw));
  } catch {
    throw new WorkspaceImportError(["manifest.json is not valid JSON."]);
  }

  const parsed = workspaceArchiveManifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new WorkspaceImportError([
      "manifest.json is malformed or unrecognized.",
    ]);
  }

  if (parsed.data.app !== WORKSPACE_ARCHIVE_APP) {
    throw new WorkspaceImportError([
      `This archive was created by a different app ("${parsed.data.app}").`,
    ]);
  }

  if (parsed.data.version > WORKSPACE_ARCHIVE_VERSION) {
    throw new WorkspaceImportError([
      `This archive (format v${parsed.data.version}) was created by a newer version of the app. Update before importing.`,
    ]);
  }

  return parsed.data;
}

function describePageIssue(key: string, message: string): string {
  return `${key.slice(WORKSPACE_PAGES_DIR.length)}: ${message}`;
}

function parsePages(files: Record<string, Uint8Array>): {
  errors: string[];
  pages: Page[];
} {
  const keys = Object.keys(files).filter(
    (key) => key.startsWith(WORKSPACE_PAGES_DIR) && key.endsWith(".json")
  );

  const pages: Page[] = [];
  const errors: string[] = [];

  for (const key of keys) {
    let json: unknown;
    try {
      json = JSON.parse(decodeTextEntry(files[key]));
    } catch {
      errors.push(describePageIssue(key, "not valid JSON"));
      continue;
    }

    const result = pageSchema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".") || "(root)";
      errors.push(
        describePageIssue(key, `${path} — ${issue?.message ?? "invalid page"}`)
      );
      continue;
    }

    pages.push(result.data);
  }

  return { errors, pages };
}

async function restoreAssets(
  files: Record<string, Uint8Array>,
  manifest: WorkspaceArchiveManifest
): Promise<{ restored: number; warnings: string[] }> {
  let restored = 0;
  const warnings: string[] = [];

  for (const entry of manifest.media) {
    const bytes = files[entry.file];
    if (!bytes) {
      warnings.push(
        `Media file "${entry.file}" is missing from the archive — some images may not load.`
      );
      continue;
    }

    try {
      const blob = new Blob([bytes as BlobPart], { type: entry.mimeType });
      const { assetId } = await putAsset(blob);
      if (assetId !== entry.assetId) {
        warnings.push(
          `Media "${entry.assetId}" changed after import and may not resolve.`
        );
      }
      restored += 1;
    } catch {
      warnings.push(`Failed to restore media "${entry.assetId}".`);
    }
  }

  return { restored, warnings };
}

function pageSettingsRow(page: Page): Partial<LocalPage> {
  return {
    ...(page.font === undefined ? {} : { font: page.font }),
    ...(page.fullWidth === undefined ? {} : { fullWidth: page.fullWidth }),
    ...(page.headerImage === undefined
      ? {}
      : { headerImage: page.headerImage }),
    ...(page.textScale === undefined ? {} : { textScale: page.textScale }),
  };
}

/** Imported pages become local rows that win over shipped content (user-owned). */
function writeImportedPage(page: Page, exists: boolean): void {
  const now = new Date().toISOString();
  const row: LocalPage = {
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parentId,
    serverBaselineHash: null,
    blockOrder: page.blocks.map((block) => block.id),
    createdAt: now,
    updatedAt: now,
    ...(page.icon === undefined ? {} : { icon: page.icon }),
    ...(page.sidebarOrder === undefined
      ? {}
      : { sidebarOrder: page.sidebarOrder }),
    ...pageSettingsRow(page),
  };

  if (exists) {
    localPagesCollection.update(page.id, (draft) => {
      Object.assign(draft, row);
      // Re-importing a previously soft-deleted page must clear its tombstone.
      draft.deletedAt = undefined;
    });
  } else {
    localPagesCollection.insert(row);
  }

  // Page row exists now, so replacePageBlocks can sync blockOrder + mark dirty.
  replacePageBlocks(page.id, page.blocks, readBlockShardForPage(page.id));
}

function applyPages(pages: Page[]): void {
  const existingIds = new Set(
    localPagesCollection.toArray.map((localPage) => localPage.id)
  );

  for (const page of pages) {
    writeImportedPage(page, existingIds.has(page.id));
    existingIds.add(page.id);
  }

  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
}

/**
 * Opens a workspace archive into local state. `replace` clears the current
 * workspace first; `merge` overlays the archive's pages onto what's there.
 * Throws {@link WorkspaceImportError} (with a full error list) before applying
 * anything if the archive is unreadable or any page fails validation.
 */
export async function importWorkspaceArchive(
  file: File,
  mode: WorkspaceImportMode
): Promise<WorkspaceImportResult> {
  const files = await readArchive(file);
  const manifest = parseManifest(files);
  const { errors, pages } = parsePages(files);

  if (errors.length > 0) {
    const noun = errors.length === 1 ? "page" : "pages";
    throw new WorkspaceImportError([
      `${errors.length} ${noun} could not be read — nothing was imported:`,
      ...errors,
    ]);
  }

  if (pages.length === 0) {
    throw new WorkspaceImportError(["This archive doesn't contain any pages."]);
  }

  if (mode === "replace") {
    await resetAllToRemote();
  }

  const { restored, warnings } = await restoreAssets(files, manifest);
  applyPages(pages);

  return {
    importedPages: pages.length,
    restoredAssets: restored,
    warnings,
  };
}
