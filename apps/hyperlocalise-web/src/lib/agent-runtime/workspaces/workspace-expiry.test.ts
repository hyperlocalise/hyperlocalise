/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { decideWorkspaceExpiry } from "./workspace-expiry";

describe("decideWorkspaceExpiry", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");

  it("keeps active sessions", () => {
    expect(
      decideWorkspaceExpiry({
        createdAt,
        lastActivityAt: new Date("2026-01-01T00:05:00.000Z"),
        now: new Date("2026-01-01T00:10:00.000Z"),
        idleTimeoutMs: 10 * 60 * 1000,
        maxLifetimeMs: 60 * 60 * 1000,
      }),
    ).toEqual({ action: "keep", reason: "active" });
  });

  it("expires idle sessions", () => {
    expect(
      decideWorkspaceExpiry({
        createdAt,
        lastActivityAt: createdAt,
        now: new Date("2026-01-01T00:30:00.000Z"),
        idleTimeoutMs: 10 * 60 * 1000,
        maxLifetimeMs: 60 * 60 * 1000,
      }),
    ).toEqual({ action: "expire", reason: "idle_timeout" });
  });

  it("expires sessions at max lifetime before idle checks", () => {
    expect(
      decideWorkspaceExpiry({
        createdAt,
        lastActivityAt: new Date("2026-01-01T00:59:00.000Z"),
        now: new Date("2026-01-01T01:00:00.000Z"),
        idleTimeoutMs: 10 * 60 * 1000,
        maxLifetimeMs: 60 * 60 * 1000,
      }),
    ).toEqual({ action: "expire", reason: "max_lifetime" });
  });
});
