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
export type WorkspaceExpiryDecision =
  | { action: "keep"; reason: "active" }
  | { action: "expire"; reason: "idle_timeout" | "max_lifetime" };

export function decideWorkspaceExpiry(input: {
  now: Date;
  lastActivityAt: Date;
  createdAt: Date;
  idleTimeoutMs: number;
  maxLifetimeMs: number;
}): WorkspaceExpiryDecision {
  const now = input.now.getTime();
  if (now - input.createdAt.getTime() >= input.maxLifetimeMs) {
    return { action: "expire", reason: "max_lifetime" };
  }
  if (now - input.lastActivityAt.getTime() >= input.idleTimeoutMs) {
    return { action: "expire", reason: "idle_timeout" };
  }
  return { action: "keep", reason: "active" };
}
