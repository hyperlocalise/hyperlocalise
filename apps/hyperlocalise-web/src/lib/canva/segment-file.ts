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
import { createHash } from "node:crypto";

export const SEGMENT_KEY_PREFIX = "canva.segment.";
export const SOURCE_TEXT_KEY_PREFIX = "canva.t.";

const SHORT_DIGEST_LENGTH = 16;

export function normalizeSegmentText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function sourceTextDigest(normalizedText: string): string {
  return createHash("sha256").update(normalizedText, "utf8").digest("hex");
}

export function sourceTextKeyFromDigest(digest: string, useFull = false): string {
  return `${SOURCE_TEXT_KEY_PREFIX}${useFull ? digest : digest.slice(0, SHORT_DIGEST_LENGTH)}`;
}

export function sourceTextKey(text: string): string {
  return sourceTextKeyFromDigest(sourceTextDigest(normalizeSegmentText(text)));
}

export function isSourceTextKey(key: string): boolean {
  return key.startsWith(SOURCE_TEXT_KEY_PREFIX);
}

export function pageNeedsReupload(sourceFile: Record<string, string>): boolean {
  return !Object.keys(sourceFile).some(isSourceTextKey);
}

export function buildSourceTextPageFile(
  texts: string[],
  digestFn: (normalizedText: string) => string = sourceTextDigest,
): Record<string, string> {
  const unique = new Map<string, string>();
  for (const text of texts) {
    const normalized = normalizeSegmentText(text);
    if (!normalized || unique.has(normalized)) {
      continue;
    }
    unique.set(normalized, text);
  }

  const digestByNormalized = new Map<string, string>();
  const prefixCounts = new Map<string, number>();
  for (const normalized of unique.keys()) {
    const digest = digestFn(normalized);
    digestByNormalized.set(normalized, digest);
    const prefix = digest.slice(0, SHORT_DIGEST_LENGTH);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const entries: Record<string, string> = {};
  for (const [normalized, raw] of unique) {
    const digest = digestByNormalized.get(normalized) ?? digestFn(normalized);
    const useFull = (prefixCounts.get(digest.slice(0, SHORT_DIGEST_LENGTH)) ?? 0) > 1;
    entries[sourceTextKeyFromDigest(digest, useFull)] = raw;
  }
  return entries;
}

function isKnownSegmentKey(key: string): boolean {
  return key.startsWith(SOURCE_TEXT_KEY_PREFIX) || key.startsWith(SEGMENT_KEY_PREFIX);
}

function flattenSegmentEntries(
  output: Record<string, string>,
  prefix: string,
  value: unknown,
): void {
  if (typeof value === "string") {
    if (isKnownSegmentKey(prefix)) {
      output[prefix] = value;
    }
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    flattenSegmentEntries(output, prefix ? `${prefix}.${key}` : key, nested);
  }
}

export function parseTranslationFile(content: Record<string, unknown>): Record<string, string> {
  const translations: Record<string, string> = {};
  const leaves: Record<string, unknown> = {};
  const nested: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "string") {
      leaves[key] = value;
    } else {
      nested[key] = value;
    }
  }

  flattenSegmentEntries(translations, "", leaves);
  flattenSegmentEntries(translations, "", nested);
  return translations;
}

export function buildSourcePath(designId: string): string {
  return `canva/designs/${designId}.json`;
}

export function pageFileNumber(pageIndex: number): number {
  return pageIndex + 1;
}

export function buildPageFileName(pageIndex: number): string {
  return `page-${pageFileNumber(pageIndex)}.json`;
}

function canvaPathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export function buildPageSourcePath(
  designSlug: string,
  designId: string,
  pageIndex: number,
): string {
  return `canva/designs/${designSlug}-${canvaPathSegment(designId)}/${buildPageFileName(pageIndex)}`;
}
