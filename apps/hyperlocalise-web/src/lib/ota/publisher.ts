/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { OtaManifestSnapshot } from "@/lib/database/schema/ota";

import { OTA_CACHE_CONTROL, otaContentType, otaManifestContentType } from "./formats";
import type { OtaReleaseSnapshot } from "./snapshot";
import { otaObjectKey, type OtaObjectStore } from "./store";

export async function publishOtaSnapshot(input: {
  store: OtaObjectStore;
  hash: string;
  format: Parameters<typeof otaContentType>[0];
  snapshot: OtaReleaseSnapshot;
}): Promise<string> {
  for (const file of input.snapshot.files) {
    await input.store.put({
      key: otaObjectKey(input.hash, file.relativePath),
      body: file.body,
      contentType: otaContentType(input.format),
      cacheControl: OTA_CACHE_CONTROL,
    });
  }

  const manifestBody = Buffer.from(`${JSON.stringify(input.snapshot.manifest)}\n`, "utf8");
  const manifestKey = otaObjectKey(input.hash, "manifest.json");
  await input.store.put({
    key: manifestKey,
    body: manifestBody,
    contentType: otaManifestContentType(),
    cacheControl: OTA_CACHE_CONTROL,
  });
  return manifestKey;
}

export async function copyOtaPrefix(
  store: OtaObjectStore,
  fromHash: string,
  toHash: string,
): Promise<number> {
  const prefix = `${fromHash}/`;
  const keys = await store.listPrefix(prefix);
  let copied = 0;
  for (const key of keys) {
    const stored = await store.get(key);
    if (!stored) {
      continue;
    }
    await store.put({
      key: `${toHash}/${key.slice(prefix.length)}`,
      body: stored.body,
      contentType: stored.contentType,
      cacheControl: stored.cacheControl,
    });
    copied += 1;
  }
  return copied;
}

export async function deleteOtaPrefix(store: OtaObjectStore, hash: string): Promise<void> {
  await store.deletePrefix(`${hash}/`);
}

export function manifestArtifactPointer(hash: string): string {
  return otaObjectKey(hash, "manifest.json");
}

export function parseStoredManifest(body: Buffer): OtaManifestSnapshot | null {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as OtaManifestSnapshot;
    if (parsed.schema_version !== 1 || typeof parsed.timestamp !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
