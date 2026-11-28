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
export const STORYBLOK_PIPES_SLUG = "storyblok" as const;

/**
 * Management API hosts per space region. A space only answers on the host for
 * the region it was created in, so the connection stores the region.
 */
export const STORYBLOK_REGION_BASE_URLS = {
  eu: "https://mapi.storyblok.com/v1",
  us: "https://api-us.storyblok.com/v1",
  ca: "https://api-ca.storyblok.com/v1",
  ap: "https://api-ap.storyblok.com/v1",
  cn: "https://app.storyblokchina.cn/v1",
} as const;

export type StoryblokRegion = keyof typeof STORYBLOK_REGION_BASE_URLS;

export const STORYBLOK_REGIONS = Object.keys(STORYBLOK_REGION_BASE_URLS) as StoryblokRegion[];

export function isStoryblokRegion(value: unknown): value is StoryblokRegion {
  return typeof value === "string" && value in STORYBLOK_REGION_BASE_URLS;
}

/** Version 1 of the translation export format is deprecated. */
export const STORYBLOK_EXPORT_FORMAT_VERSION = 2;

/**
 * Top-level keys in an export.json payload that describe the story rather than
 * hold translatable text. They are kept on the sync state and sent back on
 * import, but never become source strings.
 */
export const STORYBLOK_EXPORT_META_KEYS = ["page", "language", "url", "text_nodes"] as const;

export const STORYBLOK_STORIES_PAGE_SIZE = 100;

/** Starter spaces allow 3 Management API requests per second. */
export const STORYBLOK_IMPORT_CONCURRENCY = 2;

export const STORYBLOK_PUSH_CONCURRENCY = 2;

export const STORYBLOK_MAX_RATE_LIMIT_RETRIES = 3;

export const STORYBLOK_RATE_LIMIT_BASE_DELAY_MS = 1000;

export const STORYBLOK_MAX_FOLDER_SLUGS = 50;
