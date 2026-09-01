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

import { createHash } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  verifyCanvaUserTokenMock: vi.fn(async () => ({ userId: "canva-user", brandId: "brand-1" })),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/canva/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canva/auth")>();
  return {
    ...actual,
    verifyCanvaUserToken: mocks.verifyCanvaUserTokenMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createCanvaConnection } from "@/lib/canva/connections";
import {
  CANVA_OAUTH_REQUEST_COOKIE,
  createCanvaOauthAuthorizationRequest,
} from "@/lib/canva/oauth";
import { env } from "@/lib/env";
import { db } from "@/lib/database/client";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const app = createApp();
const client = testClient<AppType>(app);
const apiKeyFixture = createApiKeyTestFixture(client);
const projectFixture = createProjectTestFixture(client);

const REDIRECT_URI = "https://canva.example.test/oauth/callback";
const VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${env.CANVA_OAUTH_CLIENT_ID}:${env.CANVA_OAUTH_CLIENT_SECRET}`).toString("base64")}`;
}

function requestCookie() {
  return createCanvaOauthAuthorizationRequest({
    clientId: env.CANVA_OAUTH_CLIENT_ID ?? "test-canva-oauth-client",
    redirectUri: REDIRECT_URI,
    codeChallenge: pkceChallenge(VERIFIER),
    codeChallengeMethod: "S256",
    scope: "canva",
    state: "canva-state",
  });
}

async function createConnectedWorkspace() {
  const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
  await apiKeyFixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext!;
  const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
    name: "Canva OAuth key",
  });
  const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };
  const projectResponse = await projectFixture.createProjectViaApi(identity);
  const projectBody = (await projectResponse.json()) as { project: { id: string } };
  const created = await createCanvaConnection({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
    displayName: "Canva OAuth",
    apiKeyId: apiKeyBody.apiKey.id,
    projectId: projectBody.project.id,
    sourceLocale: "en",
    targetLocales: ["es"],
  });

  return { auth, created };
}

describe("canvaOauthRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("publishes authorization server metadata", async () => {
    const response = await app.request(
      "http://localhost/api/oauth/canva/.well-known/oauth-authorization-server",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        authorization_endpoint: "http://localhost/api/oauth/canva/authorize",
        token_endpoint: "http://localhost/api/oauth/canva/token",
        revocation_endpoint: "http://localhost/api/oauth/canva/revoke",
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
      }),
    );
  });

  it("rejects authorize requests with an unknown client", async () => {
    const url = new URL("http://localhost/api/oauth/canva/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "unknown-client");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("code_challenge", pkceChallenge(VERIFIER));
    url.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(url);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_client" });
  });

  it("redirects signed-in users to the consent page", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);

    const url = new URL("http://localhost/api/oauth/canva/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.CANVA_OAUTH_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("code_challenge", pkceChallenge(VERIFIER));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", "canva-state");

    const response = await app.request(url);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/en/connect/canva/oauth");
    expect(response.headers.get("set-cookie")).toContain(CANVA_OAUTH_REQUEST_COOKIE);
  });

  it("issues, refreshes, and revokes Canva OAuth tokens", async () => {
    const { created } = await createConnectedWorkspace();

    const consentResponse = await app.request("http://localhost/api/oauth/canva/consent", {
      method: "POST",
      headers: {
        cookie: `${CANVA_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ connectionId: created.connection.id }).toString(),
    });

    expect(consentResponse.status).toBe(302);
    const consentLocation = new URL(consentResponse.headers.get("location") ?? "");
    expect(consentLocation.origin + consentLocation.pathname).toBe(REDIRECT_URI);
    expect(consentLocation.searchParams.get("state")).toBe("canva-state");
    const code = consentLocation.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await app.request("http://localhost/api/oauth/canva/token", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
      }).toString(),
    });

    expect(tokenResponse.status).toBe(200);
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    };
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.access_token).toMatch(/^hl_canva_at_/);
    expect(tokens.refresh_token).toMatch(/^hl_canva_rt_/);
    expect(tokens.expires_in).toBe(3600);

    const replay = await app.request("http://localhost/api/oauth/canva/token", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
      }).toString(),
    });
    expect(replay.status).toBe(400);

    const sessionResponse = await client.api.integrations.canva.session.$get(
      {},
      {
        headers: {
          "X-Hyperlocalise-Access-Token": tokens.access_token,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );
    expect(sessionResponse.status).toBe(200);
    const sessionBody = (await sessionResponse.json()) as {
      session: { connection: { id: string } };
    };
    expect(sessionBody.session.connection.id).toBe(created.connection.id);

    const refreshResponse = await app.request("http://localhost/api/oauth/canva/token", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      }).toString(),
    });
    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(refreshed.access_token).toMatch(/^hl_canva_at_/);
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

    const revokeResponse = await app.request("http://localhost/api/oauth/canva/revoke", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: refreshed.refresh_token }).toString(),
    });
    expect(revokeResponse.status).toBe(200);

    const revokedRefresh = await app.request("http://localhost/api/oauth/canva/token", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshed.refresh_token,
      }).toString(),
    });
    expect(revokedRefresh.status).toBe(400);
  });

  it("denies consent when the user cancels", async () => {
    const response = await app.request("http://localhost/api/oauth/canva/deny", {
      method: "POST",
      headers: {
        cookie: `${CANVA_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
      },
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("canva-state");
  });
});
