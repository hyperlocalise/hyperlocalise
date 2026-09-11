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
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

const JSON_COMPATIBLE_EXPORT_FORMATS = new Set(["json", "jsonc", "arb"]);

export function isContentSyncJsonCompatiblePath(path: string): boolean {
  const format = inferSupportedTranslationFileFormat(path);
  return format !== null && JSON_COMPATIBLE_EXPORT_FORMATS.has(format);
}

export function buildContentSyncLocalePath(providerPath: string, locale: string): string {
  const extensionIndex = providerPath.lastIndexOf(".");
  if (extensionIndex > 0) {
    return `${providerPath.slice(0, extensionIndex)}-${locale}${providerPath.slice(extensionIndex)}`;
  }
  return `${providerPath}-${locale}`;
}

export function serializeContentSyncJsonExport(entries: Record<string, string>): Buffer {
  return Buffer.from(`${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export function shouldExportContentSyncTranslations(input: {
  translatedKeyCount: number;
  prefilled: Record<string, string>;
}): boolean {
  return input.translatedKeyCount > 0 && Object.keys(input.prefilled).length > 0;
}

export function buildContentSyncPushCandidate(input: {
  providerPath: string;
  locale: string;
  translatedKeyCount: number;
  prefilled: Record<string, string>;
}): { targetPath: string; content: Buffer } | null {
  if (!isContentSyncJsonCompatiblePath(input.providerPath)) {
    return null;
  }
  if (!shouldExportContentSyncTranslations(input)) {
    return null;
  }
  return {
    targetPath: buildContentSyncLocalePath(input.providerPath, input.locale),
    content: serializeContentSyncJsonExport(input.prefilled),
  };
}
