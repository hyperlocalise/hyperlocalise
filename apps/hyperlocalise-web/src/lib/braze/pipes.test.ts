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
  getBrazePipesConnectionStatus,
  loadBrazePipesApiKey,
  resolveBrazePipesWorkosUserId,
} from "./pipes";

describe("resolveBrazePipesWorkosUserId", () => {
  it("returns a trimmed explicit WorkOS user id without querying the database", async () => {
    await expect(
      resolveBrazePipesWorkosUserId({
        workosUserId: "  user_123  ",
        localUserId: "local-1",
      }),
    ).resolves.toBe("user_123");
  });

  it("returns null when neither identity is provided", async () => {
    await expect(resolveBrazePipesWorkosUserId({})).resolves.toBeNull();
  });
});

describe("Braze Pipes error mapping", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps a missing Pipes account to braze_not_connected", async () => {
    getPipesAccountStatus.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "Connect Braze first." }),
    );

    const result = await getBrazePipesConnectionStatus({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_not_connected");
    }
    expect(getPipesAccountStatus).toHaveBeenCalledWith({
      provider: "braze",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });
  });

  it("maps a stale install to braze_pipes_needs_reauthorization", async () => {
    loadPipesApiKey.mockResolvedValue(
      err({
        code: "pipes_needs_reauthorization",
        message: "Reconnect Braze.",
      }),
    );

    const result = await loadBrazePipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_pipes_needs_reauthorization");
    }
  });

  it("maps other Pipes failures to braze_pipes_unavailable", async () => {
    getPipesAccountStatus.mockResolvedValue(
      err({ code: "pipes_unavailable", message: "WorkOS is down." }),
    );

    const result = await getBrazePipesConnectionStatus({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_pipes_unavailable");
    }
  });

  it("passes through a connected Pipes status", async () => {
    getPipesAccountStatus.mockResolvedValue(
      ok({ connected: true, needsReauthorization: false, apiKeyLast4: "abcd" }),
    );

    const result = await getBrazePipesConnectionStatus({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        connected: true,
        needsReauthorization: false,
        apiKeyLast4: "abcd",
      });
    }
  });

  it("vends the stored Braze API key from Pipes", async () => {
    loadPipesApiKey.mockResolvedValue(ok(" braze-rest-key "));

    const result = await loadBrazePipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(" braze-rest-key ");
    }
    expect(loadPipesApiKey).toHaveBeenCalledWith({
      provider: "braze",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });
  });
});
