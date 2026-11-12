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

export const DEFAULT_PROJECT_BRANCH_NAME = "main";

const PROJECT_BRANCH_NAME_PATTERN =
  /^(?!.*\/\/)[A-Za-z0-9._](?:[A-Za-z0-9._/-]{0,126}[A-Za-z0-9._])?$/;

export function normalizeProjectBranchName(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function isValidProjectBranchName(value: string): boolean {
  const name = normalizeProjectBranchName(value);
  return PROJECT_BRANCH_NAME_PATTERN.test(name);
}

export function resolvedProjectBranchName(value?: string | null): string {
  const name = normalizeProjectBranchName(value ?? "");
  return name || DEFAULT_PROJECT_BRANCH_NAME;
}
