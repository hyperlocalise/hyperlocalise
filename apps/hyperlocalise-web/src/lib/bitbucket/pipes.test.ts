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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  getPipesOrganizationAccount: vi.fn(),
  loadPipesAccessToken: vi.fn(),
  createPipesAuthorizeUrl: vi.fn(),
  deletePipesConnectedAccount: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => mocks);

import { createBitbucketAuthorizeUrl, disconnectBitbucket, loadBitbucketAccess } from "./pipes";

function account(overrides: Record<string, unknown> = {}) {
  return ok({
    connected: true,
    needsReauthorization: false,
    establisherLeft: false,
    establishedByWorkosUserId: "user_admin",
    accountName: "Acme",
    ...overrides,
  });
}

describe("Bitbucket through WorkOS Pipes", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
  });

  it("issues the workspace token on behalf of the admin who connected it", async () => {
    mocks.getPipesOrganizationAccount.mockResolvedValue(account());
    mocks.loadPipesAccessToken.mockResolvedValue(ok("bb-token"));

    const result = await loadBitbucketAccess({ localOrganizationId: "org_1" });

    expect(isOk(result) && result.value).toEqual({ accessToken: "bb-token" });
    expect(mocks.loadPipesAccessToken).toHaveBeenCalledWith({
      provider: "bitbucket",
      localOrganizationId: "org_1",
      workosUserId: "user_admin",
      connectionOwner: "organization",
    });
  });

  it("asks for a reconnect when the admin who connected it has left", async () => {
    mocks.getPipesOrganizationAccount.mockResolvedValue(
      account({
        connected: false,
        needsReauthorization: true,
        establisherLeft: true,
        establishedByWorkosUserId: null,
      }),
    );

    const result = await loadBitbucketAccess({ localOrganizationId: "org_1" });

    expect(isErr(result) && result.error.code).toBe("bitbucket_needs_reconnect");
    expect(isErr(result) && result.error.message).toMatch(/has left this workspace/);
    expect(mocks.loadPipesAccessToken).not.toHaveBeenCalled();
  });

  it("says Bitbucket isn't connected when the workspace has no connection", async () => {
    mocks.getPipesOrganizationAccount.mockResolvedValue(
      account({ connected: false, establishedByWorkosUserId: null }),
    );

    const result = await loadBitbucketAccess({ localOrganizationId: "org_1" });

    expect(isErr(result) && result.error.code).toBe("bitbucket_not_connected");
  });

  it("maps a lapsed token to a reconnect", async () => {
    mocks.getPipesOrganizationAccount.mockResolvedValue(account());
    mocks.loadPipesAccessToken.mockResolvedValue(
      err({ code: "pipes_needs_reauthorization", message: "Reconnect" }),
    );

    const result = await loadBitbucketAccess({ localOrganizationId: "org_1" });

    expect(isErr(result) && result.error.code).toBe("bitbucket_needs_reconnect");
  });

  it("connects and disconnects the organization's account, not the person's own", async () => {
    mocks.createPipesAuthorizeUrl.mockResolvedValue(ok({ url: "https://workos.test/authorize" }));
    mocks.deletePipesConnectedAccount.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "gone" }),
    );

    const url = await createBitbucketAuthorizeUrl({
      localOrganizationId: "org_1",
      workosUserId: "user_admin",
      returnTo: "https://app.test/back",
    });
    const removed = await disconnectBitbucket({
      localOrganizationId: "org_1",
      workosUserId: "user_admin",
    });

    expect(isOk(url) && url.value.url).toBe("https://workos.test/authorize");
    expect(mocks.createPipesAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "bitbucket", connectionOwner: "organization" }),
    );
    expect(mocks.deletePipesConnectedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "bitbucket", connectionOwner: "organization" }),
    );
    // Already gone counts as done.
    expect(isOk(removed)).toBe(true);
  });
});
