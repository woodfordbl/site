import { createStore, del, get, keys, set } from "idb-keyval";

const assetStore = createStore("site-assets", "assets");

function assertAssetStoreAvailable(): void {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
}

async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer()
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface PutAssetResult {
  assetId: string;
  mimeType: string;
}

/** Assets stored this session — the orphan sweep skips them so an upload racing the block write is never collected. */
const sessionPutAssetIds = new Set<string>();

export function wasAssetPutThisSession(assetId: string): boolean {
  return sessionPutAssetIds.has(assetId);
}

/** Stores a blob under its SHA-256 content hash; skips write when bytes already exist. */
export async function putAsset(file: File | Blob): Promise<PutAssetResult> {
  assertAssetStoreAvailable();
  const assetId = await hashBlob(file);
  const existing = await get<Blob>(assetId, assetStore);
  if (existing === undefined) {
    await set(assetId, file, assetStore);
  }
  sessionPutAssetIds.add(assetId);
  return { assetId, mimeType: file.type };
}

export function getAsset(assetId: string): Promise<Blob | undefined> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(undefined);
  }
  return get<Blob>(assetId, assetStore);
}

export async function deleteAsset(assetId: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  await del(assetId, assetStore);
}

export function listAssetKeys(): Promise<string[]> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve([]);
  }
  return keys(assetStore) as Promise<string[]>;
}
