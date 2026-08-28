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

/** Hard cap for translation units in one import. Larger files are rejected, never truncated. */
export const TMX_DEFAULT_MAX_UNITS = 50_000;

/** Default number of entries written per database batch. */
export const TMX_DEFAULT_BATCH_SIZE = 250;

/** Matches the create-entry body limit so imported segments stay writable. */
export const TMX_MAX_SEGMENT_CHARS = 100_000;

/** Cap issue rows returned in preview and final reports. */
export const TMX_MAX_REPORT_ISSUES = 200;

/** Candidate rows returned for import preview. */
export const TMX_MAX_PREVIEW_ENTRIES = 25;

/** Created entries echoed in the import JSON response. */
export const TMX_MAX_RESPONSE_ENTRIES = 100;

/** Lookup batch size for existing external keys and source tuples. */
export const TMX_LOOKUP_BATCH_SIZE = 100;

export const TMX_INLINE_ELEMENTS = new Set(["bpt", "ept", "ph", "it", "hi", "sub", "ut"]);

export const TMX_SUPPORTED_ENCODINGS = new Set([
  "utf-8",
  "utf8",
  "us-ascii",
  "ascii",
  "utf-16",
  "utf-16le",
  "utf-16be",
]);

export const TMX_CONTEXT_PROP_TYPES = new Set([
  "context",
  "x-context",
  "x-context-string",
  "x-context-pre",
  "x-context-post",
]);

/**
 * TMX 1.4 elements that Hyperlocalise does not import.
 * They are skipped with a warning when present.
 */
export const TMX_UNSUPPORTED_ELEMENTS = [
  "ude",
  "map",
  "r",
  "alttrans",
] as const;
