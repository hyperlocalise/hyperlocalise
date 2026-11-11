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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

const { getPipesAccountStatus, loadPipesApiKey } = vi.hoisted(() => ({
  getPipesAccountStatus: vi.fn(),
  loadPipesApiKey: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  getPipesAccountStatus,
  loadPipesApiKey,
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: vi.fn(),
  },
  schema: {
    users: {
      id: "id",
      workosUserId: "workosUserId",
    },
  },
}));

import {
  getIntercomPipesConnectionStatus,
  loadIntercomPipesAccessToken,
  resolveIntercomPipesWorkosUserId,
} from "./pipes";

describe("resolveIntercomPipesWorkosUserId", () => {
  it("returns a trimmed explicit WorkOS user id without querying the database", async () => {
    await expect(
      resolveIntercomPipesWorkosUserId({
        workosUserId: "  user_123  ",
        localUserId: "local-1",
      }),
    ).resolves.toBe("user_123");
  });

  it("treats whitespace-only explicit ids as missing", async () => {
    await expect(
      resolveIntercomPipesWorkosUserId({
        workosUserId: "   ",
      }),
    ).resolves.toBeNull();
  });

  it("returns null when neither identity is provided", async () => {
    await expect(resolveIntercomPipesWorkosUserId({})).resolves.toBeNull();
  });
});

describe("Intercom Pipes error mapping", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps a missing Pipes account to intercom_not_connected", async () => {
    getPipesAccountStatus.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "Connect Intercom first." }),
    );

    const result = await getIntercomPipesConnectionStatus({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_not_connected");
    }
  });

  it("maps a stale OAuth install to intercom_pipes_needs_reauthorization", async () => {
    loadPipesApiKey.mockResolvedValue(
      err({
        code: "pipes_needs_reauthorization",
        message: "Reconnect Intercom.",
      }),
    );

    const result = await loadIntercomPipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_pipes_needs_reauthorization");
    }
  });

  it("maps other Pipes failures to intercom_pipes_unavailable", async () => {
    getPipesAccountStatus.mockResolvedValue(
      err({ code: "pipes_workos_unavailable", message: "WorkOS is down." }),
    );

    const result = await getIntercomPipesConnectionStatus({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("intercom_pipes_unavailable");
    }
  });

  it("passes through a connected Pipes status", async () => {
    getPipesAccountStatus.mockResolvedValue(ok({ connected: true, needsReauthorization: false }));

    const result = await getIntercomPipesConnectionStatus({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({ connected: true, needsReauthorization: false });
    }
  });
});
