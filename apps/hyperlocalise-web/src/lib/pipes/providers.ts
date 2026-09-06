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

/** WorkOS Pipes slugs Hyperlocalise exposes through the org pipes API. */
export const PIPES_PROVIDER_SLUGS = ["ahrefs"] as const;

export type PipesProviderSlug = (typeof PIPES_PROVIDER_SLUGS)[number];
