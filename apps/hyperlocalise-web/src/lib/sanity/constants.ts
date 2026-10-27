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

export const SANITY_PIPES_SLUG = "sanity" as const;

/** Pinned Sanity API version for Content Lake and Manage API. */
export const SANITY_API_VERSION = "2025-02-19";

export const SANITY_MANAGE_API_BASE = `https://api.sanity.io/v${SANITY_API_VERSION}`;

export const SANITY_IMPORT_STALE_CONFIG = "sanity_import_stale_config";
export const SANITY_PUSH_STALE_CONFIG = "sanity_push_stale_config";

export const SANITY_DOCUMENT_IMPORT_CONCURRENCY = 3;
export const SANITY_PUSH_CONCURRENCY = 3;
