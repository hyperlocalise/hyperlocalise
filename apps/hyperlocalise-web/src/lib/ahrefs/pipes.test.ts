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
import { NotFoundException } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  getWorkosServerClient: vi.fn(),
  loadWorkosOrganizationId: vi.fn(),
  getUserConnectedAccount: vi.fn(),
  createDataIntegrationCredential: vi.fn(),
  organizationSelect: vi.fn(),
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: (...args: unknown[]) => mocks.getWorkosServerClient(...args),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.organizationSelect(),
        }),
      }),
    }),
  },
  schema: {
    organizations: { id: "id", workosOrganizationId: "workosOrganizationId" },
    users: { id: "id", workosUserId: "workosUserId" },
  },
}));

import { getAhrefsPipesConnectionStatus, loadAhrefsPipesApiKey } from "./pipes";

describe("ahrefs pipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationSelect.mockResolvedValue([{ workosOrganizationId: "org_workos" }]);
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: {
        getUserConnectedAccount: mocks.getUserConnectedAccount,
        createDataIntegrationCredential: mocks.createDataIntegrationCredential,
      },
    });
  });

  it("reports disconnected when WorkOS has no Ahrefs account", async () => {
    mocks.getUserConnectedAccount.mockRejectedValue(new NotFoundException("missing"));

    const result = await getAhrefsPipesConnectionStatus({
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toEqual({
      connected: false,
      needsReauthorization: false,
      apiKeyLast4: null,
    });
  });

  it("reports connected for an active API-key installation", async () => {
    mocks.getUserConnectedAccount.mockResolvedValue({
      state: "connected",
      apiKeyLast4: "abcd",
    });

    const result = await getAhrefsPipesConnectionStatus({
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toEqual({
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    });
    expect(mocks.getUserConnectedAccount).toHaveBeenCalledWith({
      slug: "ahrefs",
      userId: "user_workos",
      organizationId: "org_workos",
    });
  });

  it("reports needs_reauthorization for a stale Ahrefs installation", async () => {
    mocks.getUserConnectedAccount.mockResolvedValue({
      state: "needs_reauthorization",
      apiKeyLast4: "wxyz",
    });

    const result = await getAhrefsPipesConnectionStatus({
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toEqual({
      connected: false,
      needsReauthorization: true,
      apiKeyLast4: "wxyz",
    });
  });

  it("vends the stored Ahrefs API key from Pipes", async () => {
    mocks.createDataIntegrationCredential.mockResolvedValue({
      active: true,
      credential: { value: " ahrefs-mcp-key " },
    });

    const result = await loadAhrefsPipesApiKey({
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toBe("ahrefs-mcp-key");
  });

  it("maps a missing Pipes credential to ahrefs_not_connected", async () => {
    mocks.createDataIntegrationCredential.mockResolvedValue({
      active: false,
      error: "not_installed",
    });

    const result = await loadAhrefsPipesApiKey({
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error.code).toBe("ahrefs_not_connected");
  });
});
