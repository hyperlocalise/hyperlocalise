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

const mocks = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  refreshMock: vi.fn(),
  loadSealedSessionMock: vi.fn(),
  getWorkosAuthKitConfigMock: vi.fn(),
}));

vi.mock("@/lib/workos/config", () => ({
  getWorkosAuthKitConfig: mocks.getWorkosAuthKitConfigMock,
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({
    userManagement: {
      loadSealedSession: mocks.loadSealedSessionMock,
    },
  }),
}));

import { authenticateSealedWorkosSession } from "./sealed-session";

const user = {
  id: "user_workos",
  email: "dev@example.com",
  firstName: null,
  lastName: null,
  profilePictureUrl: null,
};

function jwtWithSubject(sub: string) {
  const payload = Buffer.from(JSON.stringify({ sub }), "utf8").toString("base64url");
  return `header.${payload}.sig`;
}

describe("authenticateSealedWorkosSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the unsealed WorkOS user when the sealed session authenticates", async () => {
    mocks.getWorkosAuthKitConfigMock.mockReturnValue({
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    mocks.loadSealedSessionMock.mockReturnValue({
      authenticate: mocks.authenticateMock,
      refresh: mocks.refreshMock,
    });
    mocks.authenticateMock.mockResolvedValue({
      authenticated: true,
      user,
      organizationId: "org_workos",
      accessToken: jwtWithSubject("user_workos"),
    });

    await expect(authenticateSealedWorkosSession("sealed.session")).resolves.toEqual({
      user,
      organizationId: "org_workos",
    });
    expect(mocks.refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes when the access token JWT is expired", async () => {
    mocks.getWorkosAuthKitConfigMock.mockReturnValue({
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    mocks.loadSealedSessionMock.mockReturnValue({
      authenticate: mocks.authenticateMock,
      refresh: mocks.refreshMock,
    });
    mocks.authenticateMock.mockResolvedValue({
      authenticated: false,
      reason: "invalid_jwt",
    });
    mocks.refreshMock.mockResolvedValue({
      authenticated: true,
      session: {
        user,
        organizationId: "org_workos",
        accessToken: jwtWithSubject("user_workos"),
      },
    });

    await expect(authenticateSealedWorkosSession("sealed.session")).resolves.toEqual({
      user,
      organizationId: "org_workos",
    });
  });

  it("rejects a sealed user that does not match the access token subject", async () => {
    mocks.getWorkosAuthKitConfigMock.mockReturnValue({
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    mocks.loadSealedSessionMock.mockReturnValue({
      authenticate: mocks.authenticateMock,
      refresh: mocks.refreshMock,
    });
    mocks.authenticateMock.mockResolvedValue({
      authenticated: true,
      user,
      organizationId: "org_workos",
      accessToken: jwtWithSubject("other_user"),
    });

    await expect(authenticateSealedWorkosSession("sealed.session")).resolves.toBeNull();
  });

  it("returns null when WorkOS is not configured", async () => {
    mocks.getWorkosAuthKitConfigMock.mockReturnValue(null);

    await expect(authenticateSealedWorkosSession("sealed.session")).resolves.toBeNull();
    expect(mocks.loadSealedSessionMock).not.toHaveBeenCalled();
  });
});
