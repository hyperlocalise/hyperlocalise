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

const VALID_CHALLENGE = "a".repeat(43);
const VALID_VERIFIER = "b".repeat(43);

const client = testClient(createApp());

describe("nativeAuthRoutes", () => {
  afterEach(() => {
    getAuthorizationUrlMock.mockReset();
    authenticateWithCodeMock.mockReset();
    getWorkosServerClientMock.mockReset();
    getWorkosAuthKitConfigMock.mockReset();
  });

  it("rejects disallowed redirect URIs on authorize", async () => {
    getWorkosAuthKitConfigMock.mockReturnValue({
      clientId: "client_test",
      apiKey: "sk_test",
      redirectUri: "http://localhost:3000/auth/callback",
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    getWorkosServerClientMock.mockReturnValue({
      userManagement: { getAuthorizationUrl: getAuthorizationUrlMock },
    });

    const response = await client.api.auth.native.authorize.$get({
      query: {
        codeChallenge: VALID_CHALLENGE,
        codeChallengeMethod: "S256",
        redirectUri: "https://evil.example/callback",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "redirect_uri_not_allowed" });
    expect(getAuthorizationUrlMock).not.toHaveBeenCalled();
  });

  it("returns an AuthKit authorization URL for the Mac redirect", async () => {
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

    const response = await client.api.auth.native.authorize.$get({
      query: {
        codeChallenge: VALID_CHALLENGE,
        codeChallengeMethod: "S256",
        redirectUri: "hyperlocalise://auth/callback",
        state: "state-value-12",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authorization: {
        url: "https://api.workos.com/user_management/authorize?x=1",
        redirectUri: "hyperlocalise://auth/callback",
      },
    });
    expect(getAuthorizationUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "authkit",
        redirectUri: "hyperlocalise://auth/callback",
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

    const response = await client.api.auth.native.token.$post({
      json: {
        code: "auth_code",
        codeVerifier: VALID_VERIFIER,
        redirectUri: "hyperlocalise://auth/callback",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: {
        sealedSession: "sealed.session.value",
        cookieName: "wos-session",
      },
      user: {
        workosUserId: "user_123",
        email: "dev@example.com",
        firstName: "Dev",
        lastName: "User",
      },
      organizationId: "org_123",
    });
    expect(authenticateWithCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "auth_code",
        codeVerifier: VALID_VERIFIER,
        session: {
          sealSession: true,
          cookiePassword: "test-workos-cookie-password-at-least-32-chars",
        },
      }),
    );
  });

  it("rejects disallowed redirect URIs on token exchange before calling WorkOS", async () => {
    const response = await client.api.auth.native.token.$post({
      json: {
        code: "auth_code",
        codeVerifier: VALID_VERIFIER,
        redirectUri: "https://evil.example/callback",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "redirect_uri_not_allowed" });
    expect(getWorkosAuthKitConfigMock).not.toHaveBeenCalled();
    expect(getWorkosServerClientMock).not.toHaveBeenCalled();
    expect(authenticateWithCodeMock).not.toHaveBeenCalled();
  });

  it("returns 502 when WorkOS does not seal a native session", async () => {
    getWorkosAuthKitConfigMock.mockReturnValue({
      clientId: "client_test",
      apiKey: "sk_test",
      redirectUri: "http://localhost:3000/auth/callback",
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    authenticateWithCodeMock.mockResolvedValue({
      sealedSession: null,
      user: {
        id: "user_123",
        email: "dev@example.com",
      },
    });
    getWorkosServerClientMock.mockReturnValue({
      userManagement: { authenticateWithCode: authenticateWithCodeMock },
    });

    const response = await client.api.auth.native.token.$post({
      json: {
        code: "auth_code",
        codeVerifier: VALID_VERIFIER,
        redirectUri: "hyperlocalise://auth/callback",
      },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "session_seal_failed" });
    expect(authenticateWithCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "auth_code",
        codeVerifier: VALID_VERIFIER,
        session: {
          sealSession: true,
          cookiePassword: "test-workos-cookie-password-at-least-32-chars",
        },
      }),
    );
  });

  it("returns 401 when WorkOS token exchange fails", async () => {
    getWorkosAuthKitConfigMock.mockReturnValue({
      clientId: "client_test",
      apiKey: "sk_test",
      redirectUri: "http://localhost:3000/auth/callback",
      cookiePassword: "test-workos-cookie-password-at-least-32-chars",
    });
    authenticateWithCodeMock.mockRejectedValue(new Error("invalid_grant"));
    getWorkosServerClientMock.mockReturnValue({
      userManagement: { authenticateWithCode: authenticateWithCodeMock },
    });

    const response = await client.api.auth.native.token.$post({
      json: {
        code: "bad_code",
        codeVerifier: VALID_VERIFIER,
        redirectUri: "hyperlocalise://auth/callback",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "native_token_exchange_failed",
    });
  });
});
