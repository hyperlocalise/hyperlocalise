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
import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  getAuthorizationUrlMock,
  authenticateWithCodeMock,
  getWorkosServerClientMock,
  getWorkosAuthKitConfigMock,
} = vi.hoisted(() => ({
  getAuthorizationUrlMock: vi.fn(),
  authenticateWithCodeMock: vi.fn(),
  getWorkosServerClientMock: vi.fn(),
  getWorkosAuthKitConfigMock: vi.fn(),
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: getWorkosServerClientMock,
}));

vi.mock("@/lib/workos/config", () => ({
  getWorkosAuthKitConfig: getWorkosAuthKitConfigMock,
}));

import { createApp } from "@/api/app";
import { getFigmaRedirectUri } from "@/lib/workos/figma-redirect";

const VALID_CHALLENGE = "a".repeat(43);
const VALID_VERIFIER = "b".repeat(43);

const client = testClient(createApp());

describe("figmaAuthRoutes", () => {
  afterEach(() => {
    getAuthorizationUrlMock.mockReset();
    authenticateWithCodeMock.mockReset();
    getWorkosServerClientMock.mockReset();
    getWorkosAuthKitConfigMock.mockReset();
  });

  it("returns an AuthKit authorization URL for the Figma callback", async () => {
    getWorkosAuthKitConfigMock.mockReturnValue({
      clientId: "client_test",
      apiKey: "sk_test",
      redirectUri: "http://localhost:3000/auth/callback",
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    getAuthorizationUrlMock.mockReturnValue("https://api.workos.com/user_management/authorize?x=1");
    getWorkosServerClientMock.mockReturnValue({
      userManagement: { getAuthorizationUrl: getAuthorizationUrlMock },
    });

    const response = await client.api.auth.figma.authorize.$get({
      query: {
        codeChallenge: VALID_CHALLENGE,
        codeChallengeMethod: "S256",
        state: "state-value-12",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authorization: {
        url: "https://api.workos.com/user_management/authorize?x=1",
        redirectUri: getFigmaRedirectUri(),
      },
    });
    expect(getAuthorizationUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "authkit",
        redirectUri: getFigmaRedirectUri(),
        codeChallenge: VALID_CHALLENGE,
        codeChallengeMethod: "S256",
      }),
    );
  });

  it("exchanges a code for a sealed session", async () => {
    getWorkosAuthKitConfigMock.mockReturnValue({
      clientId: "client_test",
      apiKey: "sk_test",
      redirectUri: "http://localhost:3000/auth/callback",
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    authenticateWithCodeMock.mockResolvedValue({
      sealedSession: "sealed.session.value",
      user: {
        id: "user_123",
        email: "dev@example.com",
        firstName: "Dev",
        lastName: "User",
        profilePictureUrl: null,
      },
      organizationId: "org_123",
    });
    getWorkosServerClientMock.mockReturnValue({
      userManagement: { authenticateWithCode: authenticateWithCodeMock },
    });

    const response = await client.api.auth.figma.token.$post({
      json: {
        code: "auth_code",
        codeVerifier: VALID_VERIFIER,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: {
        sealedSession: "sealed.session.value",
        headerName: "X-Hyperlocalise-Figma-Session",
      },
      user: {
        workosUserId: "user_123",
        email: "dev@example.com",
        firstName: "Dev",
        lastName: "User",
      },
      organizationId: "org_123",
      redirectUri: getFigmaRedirectUri(),
    });
  });

  it("rejects an invalid token payload", async () => {
    const response = await client.api.auth.figma.token.$post({
      json: {
        code: "",
        codeVerifier: "short",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_figma_token_payload",
    });
  });
});
