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

import { normalizeSourcePath } from "@/lib/file-storage/records";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

import { slugifySanityPathSegment } from "./names";
import type {
  SanityDocumentRecord,
  SanityFieldObject,
  SanityFieldValue,
} from "./sanity-field-value";
import { isSanityFieldObject } from "./sanity-field-value";

export type SanityTranslationMap = Record<string, string>;

export function isSanityTranslationMap(value: SanityFieldValue): value is SanityTranslationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function readSanityTranslationMap(value: SanityFieldValue): SanityTranslationMap {
  if (!isSanityTranslationMap(value)) {
    return {};
  }
  const map: SanityTranslationMap = {};
  for (const [key, text] of Object.entries(value)) {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      map[trimmedKey] = text;
    }
  }
  return map;
}

export function serializeSanityTranslationMap(map: SanityTranslationMap): string {
  const sorted = Object.fromEntries(
    Object.entries(map).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function parseSanityTranslationMapJson(text: string): SanityTranslationMap {
  const parsed = safeJsonParse(text);
  if (!parsed.ok) {
    return {};
  }
  return readSanityTranslationMap(parsed.value as SanityFieldValue);
}

export function hashSanityTranslationMap(map: SanityTranslationMap): string {
  return createHash("sha256").update(serializeSanityTranslationMap(map)).digest("hex");
}

function sanityDocumentIdToken(documentId: string): string {
  return createHash("sha256").update(documentId).digest("hex").slice(0, 8);
}

export function readSanityDocumentSlug(doc: SanityDocumentRecord): string {
  const slug = doc.slug;
  if (isSanityFieldObject(slug) && "current" in slug) {
    const current = (slug as SanityFieldObject & { current?: SanityFieldValue }).current;
    if (typeof current === "string" && current.trim().length > 0) {
      return current.trim();
    }
  }
  if (typeof slug === "string" && slug.trim().length > 0) {
    return slug.trim();
  }
  const id = typeof doc._id === "string" ? doc._id.replace(/^drafts\./, "") : "document";
  return id;
}

export function buildSanityDocumentSourcePath(input: {
  sanityProjectId: string;
  dataset: string;
  documentType: string;
  documentId: string;
  slug?: string | null;
}): string {
  const publishedId = input.documentId.replace(/^drafts\./, "");
  const slugSegment = slugifySanityPathSegment(input.slug ?? "", publishedId);
  const idToken = sanityDocumentIdToken(publishedId);
  return normalizeSourcePath(
    `sanity/${input.sanityProjectId}/${input.dataset}/${input.documentType}/${slugSegment}-${idToken}.json`,
  );
}

export function isSanityDocumentSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith("sanity/") && sourcePath.endsWith(".json");
}
