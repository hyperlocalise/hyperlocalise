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

/** WorkOS Pipes data-integration slug for Loops. Configure this provider in the WorkOS Dashboard. */
export const LOOPS_PIPES_SLUG = "loops" satisfies PipesProviderSlug;

export const LOOPS_API_BASE_URL = "https://app.loops.so/api/v1";

/** `GET /transactional-emails` page size. Loops requires 10-50. */
export const LOOPS_LIST_PER_PAGE = 20;

export const LOOPS_RESOURCE_KINDS = ["transactional", "campaign", "workflow"] as const;
export type LoopsResourceKind = (typeof LOOPS_RESOURCE_KINDS)[number];

export function loopsApiUrl(path: string): string {
  return `${LOOPS_API_BASE_URL}${path}`;
}
