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

import { STORYBLOK_EXPORT_META_KEYS } from "./constants";
import type { StoryblokExportMeta, StoryblokExportPayload } from "./types";

export type StoryblokTranslationMap = Record<string, string>;

const META_KEYS = new Set<string>(STORYBLOK_EXPORT_META_KEYS);

/**
 * Splits an export.json payload into translatable strings and story metadata.
 * Content keys such as `<uid>:<component>:<field>` are kept verbatim so push
 * can send them back unchanged. Empty strings have nothing to translate.
 */
export function splitStoryblokExport(payload: StoryblokExportPayload): {
  strings: StoryblokTranslationMap;
  meta: StoryblokExportMeta;
} {
  const strings: StoryblokTranslationMap = {};
  const meta: StoryblokExportMeta = {};
  for (const [key, value] of Object.entries(payload)) {
    if (META_KEYS.has(key)) {
      meta[key as keyof StoryblokExportMeta] = value;
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      strings[key] = value;
    }
  }
  return { strings, meta };
}

/**
 * Translations already stored in Storyblok for one language. Storyblok falls
 * back to the default-language text when a field has no translation, so a
 * value equal to the source is treated as untranslated.
 */
export function existingStoryblokTranslations(input: {
  source: StoryblokTranslationMap;
  target: StoryblokExportPayload;
}): StoryblokTranslationMap {
  const { strings } = splitStoryblokExport(input.target);
  const existing: StoryblokTranslationMap = {};
  for (const [key, value] of Object.entries(strings)) {
    const sourceValue = input.source[key];
    if (sourceValue === undefined || sourceValue === value) {
      continue;
    }
    existing[key] = value;
  }
  return existing;
}

/**
 * Builds the import.json payload for one language: the current target export
 * (so fields without an approved translation keep their value), overlaid with
 * approved translations for keys that still exist in the source.
 */
export function buildStoryblokImportPayload(input: {
  currentTarget: StoryblokExportPayload;
  source: StoryblokTranslationMap;
  approved: StoryblokTranslationMap;
  langCode: string;
}): { payload: StoryblokExportPayload; changedKeys: number } {
  const payload: StoryblokExportPayload = { ...input.currentTarget };
  let changedKeys = 0;
  for (const [key, value] of Object.entries(input.approved)) {
    if (input.source[key] === undefined || typeof value !== "string") {
      continue;
    }
    if (payload[key] !== value) {
      changedKeys += 1;
    }
    payload[key] = value;
  }
  payload.language = input.langCode;
  return { payload, changedKeys };
}

export function serializeStoryblokTranslationMap(map: StoryblokTranslationMap): string {
  const sorted = Object.fromEntries(
    Object.entries(map).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function parseStoryblokTranslationMapJson(text: string): StoryblokTranslationMap {
  const parsed = safeJsonParse(text);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return {};
  }
  const map: StoryblokTranslationMap = {};
  for (const [key, value] of Object.entries(parsed.value as Record<string, unknown>)) {
    if (typeof value === "string") {
      map[key] = value;
    }
  }
  return map;
}

export function hashStoryblokTranslationMap(map: StoryblokTranslationMap): string {
  return createHash("sha256").update(serializeStoryblokTranslationMap(map)).digest("hex");
}

function sanitizeSlugSegment(segment: string): string {
  return segment.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
}

/** `storyblok/<spaceId>/<full slug>.json`, one folder per Storyblok folder. */
export function buildStoryblokStorySourcePath(input: {
  spaceId: string;
  fullSlug: string;
  storyId: string;
}): string {
  const segments = input.fullSlug
    .split("/")
    .map(sanitizeSlugSegment)
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  if (segments.length === 0) {
    segments.push(`story-${sanitizeSlugSegment(input.storyId) || "unknown"}`);
  }
  return normalizeSourcePath(`storyblok/${input.spaceId}/${segments.join("/")}.json`);
}
