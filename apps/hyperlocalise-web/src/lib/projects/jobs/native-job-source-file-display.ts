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

const STORED_FILE_ID_PATTERN =
  /^file_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERCEL_BLOB_HOST_PATTERN = /\.blob\.vercel-storage\.com\//i;
const STORAGE_KEY_PREFIX_PATTERN =
  /(?:^|\/)organizations\/[^/]+\/(?:projects\/[^/]+|workspace)\/files\/[^/]+\//;

export type NativeJobSourceFileDisplay = {
  filename: string;
  sourcePath: string;
  storedFileId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function basenameFromPath(path: string): string {
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

export function isStoredFileId(value: string): boolean {
  return STORED_FILE_ID_PATTERN.test(value.trim());
}

export function isInternalStorageFilename(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (isStoredFileId(trimmed)) {
    return true;
  }

  if (VERCEL_BLOB_HOST_PATTERN.test(trimmed) || STORAGE_KEY_PREFIX_PATTERN.test(trimmed)) {
    return true;
  }

  return trimmed.startsWith("organizations/") && trimmed.includes("/files/");
}

export function originalFilenameFromStoredName(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return "file";
  }

  if (isStoredFileId(trimmed)) {
    return "file";
  }

  let candidate = trimmed;
  try {
    if (/^https?:\/\//i.test(candidate)) {
      candidate = decodeURIComponent(new URL(candidate).pathname);
    }
  } catch {
    candidate = trimmed;
  }

  const withoutStorageKey = candidate.replace(STORAGE_KEY_PREFIX_PATTERN, "");
  return basenameFromPath(withoutStorageKey) || "file";
}

export function getJobInputPayloadString(inputPayload: unknown, key: string): string | null {
  const payload = asRecord(inputPayload);
  if (!payload) {
    return null;
  }

  return stringValue(payload[key]);
}

export function getJobInputPayloadMetadataString(
  inputPayload: unknown,
  key: string,
): string | null {
  const payload = asRecord(inputPayload);
  if (!payload) {
    return null;
  }

  const metadata = asRecord(payload.metadata);
  if (!metadata) {
    return null;
  }

  return stringValue(metadata[key]);
}

export function nativeFileJobSourceDisplayFields(input: {
  filename: string;
  sourcePath?: string | null;
}): { sourceFilename: string; sourcePath: string } {
  const sourceFilenameValue = originalFilenameFromStoredName(input.filename);
  const sourcePath = stringValue(input.sourcePath);
  const displayPath =
    sourcePath && !isInternalStorageFilename(sourcePath) ? sourcePath : sourceFilenameValue;

  return {
    sourceFilename: sourceFilenameValue,
    sourcePath: displayPath,
  };
}

export function resolveNativeJobSourceFileDisplay(input: {
  inputPayload: unknown;
  sourceFilename?: string | null;
  sourcePath?: string | null;
}): NativeJobSourceFileDisplay | null {
  const storedFileId = getJobInputPayloadString(input.inputPayload, "sourceFileId");
  if (!storedFileId) {
    return null;
  }

  const metadataFilename = getJobInputPayloadMetadataString(input.inputPayload, "sourceFilename");
  const metadataSourcePath = getJobInputPayloadMetadataString(input.inputPayload, "sourcePath");
  const resolvedFilename = stringValue(input.sourceFilename) ?? metadataFilename;
  const resolvedSourcePath = stringValue(input.sourcePath) ?? metadataSourcePath;
  const fallbackPath = isInternalStorageFilename(storedFileId) ? null : storedFileId;
  const display = nativeFileJobSourceDisplayFields({
    filename: resolvedFilename ?? fallbackPath ?? storedFileId,
    sourcePath: resolvedSourcePath ?? fallbackPath,
  });

  return {
    filename: display.sourceFilename,
    sourcePath: display.sourcePath,
    storedFileId,
  };
}

export function nativeJobSourceFileDisplayLabel(input: {
  inputPayload: unknown;
  sourceFilename?: string | null;
  sourcePath?: string | null;
}): string | null {
  return resolveNativeJobSourceFileDisplay(input)?.sourcePath ?? null;
}
