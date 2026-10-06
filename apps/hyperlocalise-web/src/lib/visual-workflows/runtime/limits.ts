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
  // Each durable slice runs at most one external action, so one AI node owns a whole workflow
  // step; keep this under the step function's maxDuration (~800s).
  aiTimeoutMs: 600000,
  runTimeoutMs: 7200000,
  // An execution lease is renewed while a slice runs, so it only lapses when the worker dies.
  leaseMs: 180000,
  leaseRenewIntervalMs: 60000,
  attempts: 3,
} as const;
