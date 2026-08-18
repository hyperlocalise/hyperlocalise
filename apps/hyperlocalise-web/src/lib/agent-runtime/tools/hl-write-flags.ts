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

/**
 * `hl check|extract` flags that create or overwrite files, or mutate
 * translation targets. The bash and runHyperlocaliseCli tools are
 * read-only; these flags must be denied there instead of going through
 * dedicated write tools that call assertRepositoryWriteAllowed.
 */
export const HL_WRITE_FLAG_NAMES = ["out-file", "output-file", "json-report", "fix"] as const;

const HL_WRITE_FLAG_NAME_SET = new Set<string>(HL_WRITE_FLAG_NAMES);

export function flagBasename(token: string): string {
  const withoutValue = token.split("=")[0] ?? token;
  return withoutValue.replace(/^-+/, "").toLowerCase();
}

export function isHlWriteFlagName(token: string): boolean {
  return HL_WRITE_FLAG_NAME_SET.has(flagBasename(token));
}
