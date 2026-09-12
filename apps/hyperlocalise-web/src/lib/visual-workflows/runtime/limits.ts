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
export const WORKFLOW_LIMITS = {
  nodes: 200,
  edges: 400,
  loopItems: 100,
  steps: 1000,
  httpTimeoutMs: 30000,
  aiTimeoutMs: 120000,
  runTimeoutMs: 900000,
  attempts: 3,
} as const;
