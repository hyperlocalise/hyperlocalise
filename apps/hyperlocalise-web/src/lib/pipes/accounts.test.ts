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
  getUserConnectedAccount: vi.fn(),
  createDataIntegrationCredential: vi.fn(),
  getAccessToken: vi.fn(),
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

import { getPipesAccountStatus, loadPipesAccessToken, loadPipesApiKey } from "./accounts";

describe("pipes accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationSelect.mockResolvedValue([{ workosOrganizationId: "org_workos" }]);
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: {
        getUserConnectedAccount: mocks.getUserConnectedAccount,
        createDataIntegrationCredential: mocks.createDataIntegrationCredential,
        getAccessToken: mocks.getAccessToken,
      },
    });
  });

  it("reports disconnected when WorkOS has no account", async () => {
    mocks.getUserConnectedAccount.mockRejectedValue(
      new NotFoundException({
        path: "/data-integrations/notion",
        requestID: "req_test_not_found",
        message: "missing",
      }),
    );

    const result = await getPipesAccountStatus({
      provider: "notion",
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

    const result = await getPipesAccountStatus({
      provider: "hubspot",
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
      slug: "hubspot",
      userId: "user_workos",
      organizationId: "org_workos",
    });
  });

  it("reports needs_reauthorization for a stale installation", async () => {
    mocks.getUserConnectedAccount.mockResolvedValue({
      state: "needs_reauthorization",
      apiKeyLast4: "wxyz",
    });

    const result = await getPipesAccountStatus({
      provider: "sendgrid",
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

  it("vends the stored API key from Pipes", async () => {
    mocks.createDataIntegrationCredential.mockResolvedValue({
      active: true,
      credential: { value: " notion-api-key " },
    });

    const result = await loadPipesApiKey({
      provider: "notion",
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toBe("notion-api-key");
    expect(mocks.createDataIntegrationCredential).toHaveBeenCalledWith({
      slug: "notion",
      userId: "user_workos",
      organizationId: "org_workos",
    });
  });

  it("maps a missing Pipes credential to pipes_not_connected", async () => {
    mocks.createDataIntegrationCredential.mockResolvedValue({
      active: false,
      error: "not_installed",
    });

    const result = await loadPipesApiKey({
      provider: "webflow",
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error.code).toBe("pipes_not_connected");
  });

  it("vends an OAuth access token from Pipes", async () => {
    mocks.getAccessToken.mockResolvedValue({
      active: true,
      accessToken: { accessToken: " glpat-oauth-token " },
    });

    const result = await loadPipesAccessToken({
      provider: "gitlab",
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toBe("glpat-oauth-token");
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      provider: "gitlab",
      userId: "user_workos",
      organizationId: "org_workos",
    });
  });

  it("maps a stale OAuth installation to pipes_needs_reauthorization", async () => {
    mocks.getAccessToken.mockResolvedValue({
      active: false,
      error: "needs_reauthorization",
    });

    const result = await loadPipesAccessToken({
      provider: "gitlab",
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error.code).toBe("pipes_needs_reauthorization");
  });
});
