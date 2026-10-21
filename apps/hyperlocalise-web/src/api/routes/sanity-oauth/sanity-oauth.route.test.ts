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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  reconcileWorkosMembershipsForUserMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-membership-reconcile")>();

  return {
    ...actual,
    reconcileWorkosMembershipsForUser: mocks.reconcileWorkosMembershipsForUserMock,
  };
});

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { revokeOrganizationMembershipAccess } from "@/api/auth/workos-sync";
import type { AppType } from "@/api/typed-app";
import { createSanityConnection, listSanityConnections } from "@/lib/sanity/connections";
import {
  SANITY_OAUTH_REQUEST_COOKIE,
  createSanityOauthAuthorizationRequest,
  listSanityOauthConsentConnections,
} from "@/lib/sanity/oauth";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const app = createApp();
const client = testClient<AppType>(app);
const apiKeyFixture = createApiKeyTestFixture();
const projectFixture = createProjectTestFixture(client);

const REDIRECT_URI = "http://localhost:3000/connect/sanity/oauth/callback";
const VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${env.SANITY_OAUTH_CLIENT_ID ?? "test-sanity-oauth-client"}:`).toString("base64")}`;
}

const STUDIO_ORIGIN = "http://localhost:3333";

function requestCookie() {
  return createSanityOauthAuthorizationRequest({
    clientId: env.SANITY_OAUTH_CLIENT_ID ?? "test-sanity-oauth-client",
    redirectUri: REDIRECT_URI,
    codeChallenge: pkceChallenge(VERIFIER),
    codeChallengeMethod: "S256",
    scope: "sanity",
    state: "sanity-state",
    studioOrigin: STUDIO_ORIGIN,
  });
}

async function createConnectedWorkspace() {
  const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
  await apiKeyFixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext!;
  const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
    name: "Sanity OAuth key",
  });
  const projectResponse = await projectFixture.createProjectViaApi(identity);
  const projectBody = (await projectResponse.json()) as { project: { id: string } };
  const created = await createSanityConnection({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
    displayName: "Sanity OAuth",
    apiKeyId: apiKey.id,
  });
  void projectBody;

  return { auth, created, identity };
}

describe("sanityOauthRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.reconcileWorkosMembershipsForUserMock.mockResolvedValue({ status: "skipped" });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("lists unbound Sanity connections for OAuth consent", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity unbound OAuth key",
    });
    const created = await createSanityConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      displayName: "Unbound Sanity OAuth",
      apiKeyId: apiKey.id,
    });

    const connections = await listSanityOauthConsentConnections(auth.user.localUserId);
    expect(
      connections.some((connection) => connection.connectionId === created.connection.id),
    ).toBe(true);
    expect(
      connections.find((connection) => connection.connectionId === created.connection.id)
        ?.displayName,
    ).toBe("Unbound Sanity OAuth");
  });

  it("publishes authorization server metadata", async () => {
    const response = await app.request(
      "http://localhost/api/oauth/sanity/.well-known/oauth-authorization-server",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        authorization_endpoint: "http://localhost/api/oauth/sanity/authorize",
        token_endpoint: "http://localhost/api/oauth/sanity/token",
        revocation_endpoint: "http://localhost/api/oauth/sanity/revoke",
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
      }),
    );
  });

  it("rejects handoff creation without a trusted Studio origin", async () => {
    const missingOrigin = await app.request("http://localhost/api/oauth/sanity/handoff", {
      method: "POST",
    });
    expect(missingOrigin.status).toBe(400);
    await expect(missingOrigin.json()).resolves.toEqual({ error: "invalid_request" });

    const untrusted = await app.request("http://localhost/api/oauth/sanity/handoff", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(untrusted.status).toBe(400);
    await expect(untrusted.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("completes OAuth through the server-side handoff", async () => {
    const handoffResponse = await app.request("http://localhost/api/oauth/sanity/handoff", {
      method: "POST",
      headers: { Origin: STUDIO_ORIGIN },
    });
    expect(handoffResponse.status).toBe(201);
    const handoff = (await handoffResponse.json()) as { readKey: string; writeKey: string };

    const completeResponse = await app.request(
      "http://localhost/api/oauth/sanity/handoff/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          writeKey: handoff.writeKey,
          code: "oauth-code-from-browser",
        }),
      },
    );
    expect(completeResponse.status).toBe(200);

    const pollResponse = await app.request(
      `http://localhost/api/oauth/sanity/handoff/${encodeURIComponent(handoff.readKey)}`,
    );
    expect(pollResponse.status).toBe(200);
    await expect(pollResponse.json()).resolves.toEqual({
      status: "done",
      code: "oauth-code-from-browser",
    });

    const replayPoll = await app.request(
      `http://localhost/api/oauth/sanity/handoff/${encodeURIComponent(handoff.readKey)}`,
    );
    expect(replayPoll.status).toBe(200);
    await expect(replayPoll.json()).resolves.toEqual({ status: "expired" });
  });

  it("rejects authorize requests with an unknown client", async () => {
    const url = new URL("http://localhost/api/oauth/sanity/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "unknown-client");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("code_challenge", pkceChallenge(VERIFIER));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", "sanity-state");
    url.searchParams.set("studio_origin", STUDIO_ORIGIN);

    const response = await app.request(url);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_client" });
  });

  it("rejects authorize when the handoff write key or studio origin does not match", async () => {
    const handoffResponse = await app.request("http://localhost/api/oauth/sanity/handoff", {
      method: "POST",
      headers: { Origin: STUDIO_ORIGIN },
    });
    const handoff = (await handoffResponse.json()) as { writeKey: string };

    const missingHandoff = new URL("http://localhost/api/oauth/sanity/authorize");
    missingHandoff.searchParams.set("response_type", "code");
    missingHandoff.searchParams.set("client_id", env.SANITY_OAUTH_CLIENT_ID ?? "");
    missingHandoff.searchParams.set("redirect_uri", REDIRECT_URI);
    missingHandoff.searchParams.set("code_challenge", pkceChallenge(VERIFIER));
    missingHandoff.searchParams.set("code_challenge_method", "S256");
    missingHandoff.searchParams.set("state", "not-a-handoff");
    missingHandoff.searchParams.set("studio_origin", STUDIO_ORIGIN);
    const missingResponse = await app.request(missingHandoff);
    expect(missingResponse.status).toBe(400);
    await expect(missingResponse.json()).resolves.toEqual({ error: "invalid_request" });

    const mismatch = new URL("http://localhost/api/oauth/sanity/authorize");
    mismatch.searchParams.set("response_type", "code");
    mismatch.searchParams.set("client_id", env.SANITY_OAUTH_CLIENT_ID ?? "");
    mismatch.searchParams.set("redirect_uri", REDIRECT_URI);
    mismatch.searchParams.set("code_challenge", pkceChallenge(VERIFIER));
    mismatch.searchParams.set("code_challenge_method", "S256");
    mismatch.searchParams.set("state", handoff.writeKey);
    mismatch.searchParams.set("studio_origin", "https://acme.sanity.studio");
    const mismatchResponse = await app.request(mismatch);
    expect(mismatchResponse.status).toBe(400);
    await expect(mismatchResponse.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("redirects signed-in users to the consent page", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);

    const handoffResponse = await app.request("http://localhost/api/oauth/sanity/handoff", {
      method: "POST",
      headers: { Origin: STUDIO_ORIGIN },
    });
    const handoff = (await handoffResponse.json()) as { writeKey: string };

    const url = new URL("http://localhost/api/oauth/sanity/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.SANITY_OAUTH_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("code_challenge", pkceChallenge(VERIFIER));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", handoff.writeKey);
    url.searchParams.set("studio_origin", STUDIO_ORIGIN);

    const response = await app.request(url);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/en/connect/sanity/oauth");
    expect(response.headers.get("set-cookie")).toContain(SANITY_OAUTH_REQUEST_COOKIE);
  });

  it("rejects authorization codes when the PKCE verifier does not match", async () => {
    const { created } = await createConnectedWorkspace();

    const consentResponse = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ connectionId: created.connection.id }).toString(),
    });
    const code = new URL(consentResponse.headers.get("location") ?? "").searchParams.get("code");
    expect(code).toBeTruthy();

    const response = await app.request("http://localhost/api/oauth/sanity/token", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: `${VERIFIER.slice(0, -1)}x`,
      }).toString(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_grant" });
  });

  it("issues, refreshes, and revokes Sanity OAuth tokens", async () => {
    const { created } = await createConnectedWorkspace();

    const consentResponse = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ connectionId: created.connection.id }).toString(),
    });

    expect(consentResponse.status).toBe(302);
    const consentLocation = new URL(consentResponse.headers.get("location") ?? "");
    expect(consentLocation.origin + consentLocation.pathname).toBe(REDIRECT_URI);
    expect(consentLocation.searchParams.get("state")).toBe("sanity-state");
    const code = consentLocation.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await app.request("http://localhost/api/oauth/sanity/token", {
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
    expect(tokens.access_token).toMatch(/^hl_sanity_at_/);
    expect(tokens.refresh_token).toMatch(/^hl_sanity_rt_/);
    expect(tokens.expires_in).toBe(3600);

    const replay = await app.request("http://localhost/api/oauth/sanity/token", {
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

    const sessionResponse = await client.api.integrations.sanity.session.$get(
      {},
      {
        headers: {
          Origin: STUDIO_ORIGIN,
          "X-Hyperlocalise-Access-Token": tokens.access_token,
        },
      },
    );
    expect(sessionResponse.status).toBe(200);
    const sessionBody = (await sessionResponse.json()) as {
      session: { connection: { id: string } };
    };
    expect(sessionBody.session.connection.id).toBe(created.connection.id);

    const refreshResponse = await app.request("http://localhost/api/oauth/sanity/token", {
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
    expect(refreshed.access_token).toMatch(/^hl_sanity_at_/);
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

    const revokeResponse = await app.request("http://localhost/api/oauth/sanity/revoke", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: refreshed.refresh_token }).toString(),
    });
    expect(revokeResponse.status).toBe(200);

    const revokedRefresh = await app.request("http://localhost/api/oauth/sanity/token", {
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

  it("allows only one concurrent refresh to succeed", async () => {
    const { created } = await createConnectedWorkspace();

    const consentResponse = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ connectionId: created.connection.id }).toString(),
    });
    const consentLocation = new URL(consentResponse.headers.get("location") ?? "");
    const code = consentLocation.searchParams.get("code");
    expect(code).toBeTruthy();

    const tokenResponse = await app.request("http://localhost/api/oauth/sanity/token", {
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
    const tokens = (await tokenResponse.json()) as { refresh_token: string };

    const [firstRefresh, secondRefresh] = await Promise.all([
      app.request("http://localhost/api/oauth/sanity/token", {
        method: "POST",
        headers: {
          authorization: basicAuthHeader(),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        }).toString(),
      }),
      app.request("http://localhost/api/oauth/sanity/token", {
        method: "POST",
        headers: {
          authorization: basicAuthHeader(),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        }).toString(),
      }),
    ]);

    const statuses = [firstRefresh.status, secondRefresh.status].toSorted(
      (left, right) => left - right,
    );
    expect(statuses).toEqual([200, 400]);
  });

  it("rejects authorization-code exchange after membership removal", async () => {
    const { created, identity } = await createConnectedWorkspace();

    const consentResponse = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ connectionId: created.connection.id }).toString(),
    });
    const code = new URL(consentResponse.headers.get("location") ?? "").searchParams.get("code");
    expect(code).toBeTruthy();

    await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: identity.membership.workosMembershipId,
      workosOrganizationId: identity.organization.workosOrganizationId,
      workosUserId: identity.user.workosUserId,
    });

    const tokenResponse = await app.request("http://localhost/api/oauth/sanity/token", {
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
    expect(tokenResponse.status).toBe(400);
  });

  it("rejects refresh and Studio session after membership removal", async () => {
    const { created, identity } = await createConnectedWorkspace();

    const consentResponse = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ connectionId: created.connection.id }).toString(),
    });
    const code = new URL(consentResponse.headers.get("location") ?? "").searchParams.get("code");
    const tokenResponse = await app.request("http://localhost/api/oauth/sanity/token", {
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
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
    };

    await revokeOrganizationMembershipAccess(db, {
      workosMembershipId: identity.membership.workosMembershipId,
      workosOrganizationId: identity.organization.workosOrganizationId,
      workosUserId: identity.user.workosUserId,
    });

    const refreshResponse = await app.request("http://localhost/api/oauth/sanity/token", {
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
    expect(refreshResponse.status).toBe(400);

    const sessionResponse = await client.api.integrations.sanity.session.$get(
      {},
      {
        headers: {
          Origin: STUDIO_ORIGIN,
          "X-Hyperlocalise-Access-Token": tokens.access_token,
        },
      },
    );
    expect(sessionResponse.status).toBe(401);
  });

  it("creates a PAT and Studio plugin connection when consent has no connection", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;

    const firstConsent = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams().toString(),
    });

    expect(firstConsent.status).toBe(302);
    const firstLocation = new URL(firstConsent.headers.get("location") ?? "");
    expect(firstLocation.searchParams.get("code")).toBeTruthy();

    const created = await listSanityConnections({
      organizationId: auth.organization.localOrganizationId,
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.displayName).toBe("Sanity Studio plugin");
    expect(created[0]?.enabled).toBe(true);

    const [apiKey] = await db
      .select({
        name: schema.organizationApiKeys.name,
        permissions: schema.organizationApiKeys.permissions,
      })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, created[0]!.apiKeyId))
      .limit(1);
    expect(apiKey?.name).toBe("Sanity Studio plugin");
    expect(apiKey?.permissions).toEqual(
      expect.arrayContaining(["files:read", "files:write", "jobs:read", "jobs:write"]),
    );

    const secondConsent = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams().toString(),
    });

    expect(secondConsent.status).toBe(302);
    expect(
      new URL(secondConsent.headers.get("location") ?? "").searchParams.get("code"),
    ).toBeTruthy();

    const reused = await listSanityConnections({
      organizationId: auth.organization.localOrganizationId,
    });
    expect(reused).toHaveLength(1);
    expect(reused[0]?.id).toBe(created[0]?.id);
  });

  it("rotates a revoked Studio plugin API key on consent", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity Studio plugin",
    });
    const created = await createSanityConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity Studio plugin",
      apiKeyId: apiKey.id,
    });
    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.organizationApiKeys.id, apiKey.id));

    const consent = await app.request("http://localhost/api/oauth/sanity/consent", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams().toString(),
    });

    expect(consent.status).toBe(302);
    expect(new URL(consent.headers.get("location") ?? "").searchParams.get("code")).toBeTruthy();

    const connections = await listSanityConnections({
      organizationId: auth.organization.localOrganizationId,
    });
    expect(connections).toHaveLength(1);
    expect(connections[0]?.id).toBe(created.connection.id);
    expect(connections[0]?.apiKeyId).not.toBe(apiKey.id);
  });

  it("denies consent when the user cancels", async () => {
    const response = await app.request("http://localhost/api/oauth/sanity/deny", {
      method: "POST",
      headers: {
        cookie: `${SANITY_OAUTH_REQUEST_COOKIE}=${requestCookie()}`,
      },
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("sanity-state");
  });
});
