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
