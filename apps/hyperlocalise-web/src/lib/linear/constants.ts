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
import type { PipesProviderSlug } from "@/lib/pipes/providers";

/** WorkOS Pipes data-integration slug for Linear (OAuth). */
export const LINEAR_PIPES_SLUG = "linear" satisfies PipesProviderSlug;

export const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

/** Linear caps GraphQL connection pages at 250 nodes. */
export const LINEAR_TEAMS_PAGE_SIZE = 250;
