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

export function isLoopsSourcePath(sourcePath: string): boolean {
  return sourcePath === "loops/" || sourcePath.startsWith("loops/");
}

export function isLoopsTransactionalSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith("loops/transactional/");
}

export function isLoopsCampaignSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith("loops/campaigns/");
}

export function isLoopsWorkflowSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith("loops/workflows/");
}
