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
export const DEFAULT_SANITY_STUDIO_ORIGINS = [
  "http://localhost:3333",
  "http://localhost:3334",
] as const;

/** Hosted Sanity Studio, e.g. https://your-project.sanity.studio */
const HOSTED_SANITY_STUDIO_ORIGIN_PATTERN =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.sanity\.studio$/;

export function isHostedSanityStudioOrigin(origin: string): boolean {
  return HOSTED_SANITY_STUDIO_ORIGIN_PATTERN.test(origin);
}
