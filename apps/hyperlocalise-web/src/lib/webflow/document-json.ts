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

export type WebflowTranslationMap = Record<string, string>;

export function serializeWebflowTranslationMap(map: WebflowTranslationMap): string {
  const sorted = Object.fromEntries(
    Object.entries(map).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function parseWebflowTranslationMapJson(text: string): WebflowTranslationMap {
  const parsed = safeJsonParse(text);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return {};
  }
  const map: WebflowTranslationMap = {};
  for (const [key, value] of Object.entries(parsed.value as Record<string, unknown>)) {
    if (typeof value === "string") {
      map[key.trim()] = value;
    }
  }
  return map;
}

export function hashWebflowTranslationMap(map: WebflowTranslationMap): string {
  return createHash("sha256").update(serializeWebflowTranslationMap(map)).digest("hex");
}

export function buildWebflowItemSourcePath(input: {
  siteId: string;
  collectionId: string;
  slug: string;
}): string {
  const slugSegment = input.slug.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "item";
  return normalizeSourcePath(`webflow/${input.siteId}/${input.collectionId}/${slugSegment}.json`);
}

export function readWebflowItemSlug(fieldData: Record<string, unknown>): string {
  const slug = fieldData.slug;
  if (typeof slug === "string" && slug.trim()) {
    return slug.trim();
  }
  const name = fieldData.name;
  if (typeof name === "string" && name.trim()) {
    return name.trim().toLowerCase().replace(/\s+/g, "-");
  }
  return "item";
}
