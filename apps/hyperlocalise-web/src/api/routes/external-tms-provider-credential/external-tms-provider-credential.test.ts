import "dotenv/config";

import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import {
  getOrganizationExternalTmsProviderCredentialSummary,
  upsertCrowdinOAuthProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { createProviderCredentialTestFixture } from "../provider-credential/provider-credential.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
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
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const client = testClient(app);
const fixture = createProviderCredentialTestFixture(client);

function base64Url(input: Buffer) {
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fetchInputUrl(input: string | URL | Request) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBodyString(body: BodyInit | null | undefined) {
  if (typeof body === "string") return body;
  throw new Error("expected string request body");
}

function crowdinOAuthCallbackUrl(organizationSlug: string, query: { state: string; code: string }) {
  const params = new URLSearchParams(query);
  return `/api/orgs/${encodeURIComponent(
    organizationSlug,
  )}/external-tms-provider-credential/crowdin/oauth/callback?${params.toString()}`;
}

function crowdinUserOAuthCallbackUrl(
  organizationSlug: string,
  query: { state: string; code: string },
) {
  const params = new URLSearchParams(query);
  return `/api/orgs/${encodeURIComponent(
    organizationSlug,
  )}/external-tms-provider-credential/crowdin/user/oauth/callback?${params.toString()}`;
}

describe("externalTmsProviderCredentialRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("stores encrypted external TMS credentials for admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "phrase",
          displayName: "Phrase Prod",
          secretMaterial: "phrase-token-super-secret",
          region: "us",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const authContext = globalThis.__testApiAuthContext;
    const [stored] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        eq(
          schema.organizationExternalTmsProviderCredentials.organizationId,
          authContext!.organization.localOrganizationId,
        ),
      );
    expect(stored?.ciphertext).not.toContain("phrase-token-super-secret");
  });

  it("refreshes updatedAt when admins replace external TMS credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "phrase",
          displayName: "Phrase",
          secretMaterial: "first-secret",
        },
      },
      { headers },
    );

    const authContext = globalThis.__testApiAuthContext;
    const [first] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            authContext!.organization.localOrganizationId,
          ),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, "phrase"),
        ),
      );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "phrase",
          displayName: "Phrase",
          secretMaterial: "second-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const [updated] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            authContext!.organization.localOrganizationId,
          ),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, "phrase"),
        ),
      );

    expect(updated!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
  });

  it("rejects Crowdin personal-token setup through the public credential route", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "crowdin",
          displayName: "Crowdin",
          secretMaterial: "crowdin-token",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_personal_token_deprecated",
    });
  });

  it("creates scoped Crowdin OAuth state and a PKCE authorization URL for admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.oauth.start.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          displayName: "Crowdin OAuth",
          oauthClientId: "crowdin-client-id",
          oauthClientSecret: "crowdin-client-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      authorizationUrl: string;
      redirectUri: string;
    };
    const authorizationUrl = new URL(data.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://accounts.crowdin.com");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("crowdin-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(data.redirectUri);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const stateParam = authorizationUrl.searchParams.get("state");
    expect(stateParam).toEqual(expect.any(String));
    const [state] = await db
      .select()
      .from(schema.crowdinOAuthStates)
      .where(
        and(
          eq(schema.crowdinOAuthStates.nonce, stateParam!),
          eq(
            schema.crowdinOAuthStates.organizationId,
            authContext.organization.localOrganizationId,
          ),
          eq(schema.crowdinOAuthStates.userId, authContext.user.localUserId),
        ),
      )
      .limit(1);

    expect(state).toMatchObject({
      oauthClientId: "crowdin-client-id",
      displayName: "Crowdin OAuth",
      consumedAt: null,
    });
    expect(state!.oauthClientSecretCiphertext).not.toContain("crowdin-client-secret");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      base64Url(createHash("sha256").update(state!.codeVerifier).digest()),
    );
    expect(data.redirectUri).toContain(
      `/api/orgs/${encodeURIComponent(identity.organization.slug ?? "missing")}/external-tms-provider-credential/crowdin/oauth/callback`,
    );
  });

  it("blocks non-admins from starting Crowdin OAuth", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.oauth.start.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          displayName: "Crowdin OAuth",
          oauthClientId: "crowdin-client-id",
          oauthClientSecret: "crowdin-client-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("rejects invalid Crowdin OAuth callback state before token exchange", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      crowdinOAuthCallbackUrl(identity.organization.slug ?? "missing", {
        state: "missing-state",
        code: "oauth-code",
      }),
      { headers },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=invalid_crowdin_oauth_state");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges Crowdin OAuth callbacks into encrypted OAuth credentials once", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const startResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.oauth.start.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          displayName: "Crowdin OAuth",
          oauthClientId: "crowdin-client-id",
          oauthClientSecret: "crowdin-client-secret",
        },
      },
      { headers },
    );
    const startBody = (await startResponse.json()) as { authorizationUrl: string };
    const stateParam = new URL(startBody.authorizationUrl).searchParams.get("state");
    const [state] = await db
      .select()
      .from(schema.crowdinOAuthStates)
      .where(eq(schema.crowdinOAuthStates.nonce, stateParam!))
      .limit(1);

    let capturedTokenBody: Record<string, unknown> | undefined;
    let capturedUserHeaders: HeadersInit | undefined;

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = fetchInputUrl(url);
      if (requestUrl === "https://accounts.crowdin.com/oauth/token") {
        capturedTokenBody = JSON.parse(requestBodyString(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            access_token: "crowdin-access-token",
            refresh_token: "crowdin-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }

      if (requestUrl === "https://api.crowdin.com/api/v2/user") {
        capturedUserHeaders = init?.headers;
        return new Response("{}", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await app.request(
      crowdinOAuthCallbackUrl(identity.organization.slug ?? "missing", {
        state: stateParam!,
        code: "oauth-code",
      }),
      { headers },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(
      `/org/${identity.organization.slug}/integrations?crowdin_connected=1`,
    );
    expect(capturedTokenBody).toMatchObject({
      grant_type: "authorization_code",
      client_id: "crowdin-client-id",
      client_secret: "crowdin-client-secret",
      code: "oauth-code",
      code_verifier: state!.codeVerifier,
    });
    expect(String(capturedTokenBody!.redirect_uri)).toContain("/crowdin/oauth/callback");
    expect(capturedUserHeaders).toEqual({ Authorization: "Bearer crowdin-access-token" });

    const [credential] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            authContext.organization.localOrganizationId,
          ),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        ),
      )
      .limit(1);

    expect(credential).toMatchObject({
      displayName: "Crowdin OAuth",
      authMode: "oauth",
      maskedSecretSuffix: "oauth",
      validationStatus: "connected",
      validationMessage: null,
    });
    expect(credential!.ciphertext).not.toContain("crowdin-access-token");
    expect(credential!.oauthExpiresAt).not.toBeNull();

    const [consumedState] = await db
      .select()
      .from(schema.crowdinOAuthStates)
      .where(eq(schema.crowdinOAuthStates.nonce, stateParam!))
      .limit(1);
    expect(consumedState!.consumedAt).not.toBeNull();

    const replayResponse = await app.request(
      crowdinOAuthCallbackUrl(identity.organization.slug ?? "missing", {
        state: stateParam!,
        code: "second-code",
      }),
      { headers },
    );

    expect(replayResponse.status).toBe(302);
    expect(replayResponse.headers.get("location")).toBe(
      "/dashboard?error=invalid_crowdin_oauth_state",
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => fetchInputUrl(url) === "https://accounts.crowdin.com/oauth/token",
      ),
    ).toHaveLength(1);
  });

  it("lets workspace members start Crowdin user OAuth when the org integration exists", async () => {
    const adminIdentity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(adminIdentity);
    const adminAuthContext = globalThis.__testApiAuthContext!;
    const credential = await upsertCrowdinOAuthProviderCredential({
      organizationId: adminAuthContext.organization.localOrganizationId,
      userId: adminAuthContext.user.localUserId,
      role: "admin",
      displayName: "Crowdin",
      tokenBundle: {
        clientId: "crowdin-client-id",
        clientSecret: "crowdin-client-secret",
        accessToken: "org-access-token",
        refreshToken: "org-refresh-token",
        tokenType: "bearer",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    const memberHeaders = await fixture.authHeadersFor(memberIdentity);
    const memberAuthContext = globalThis.__testApiAuthContext!;

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.user.oauth.start.$post(
      {
        param: { organizationSlug: memberIdentity.organization.slug ?? "missing" },
        json: { returnTo: `/org/${memberIdentity.organization.slug}/jobs?mine=true` },
      },
      { headers: memberHeaders },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { authorizationUrl: string; redirectUri: string };
    const authorizationUrl = new URL(data.authorizationUrl);
    expect(authorizationUrl.searchParams.get("client_id")).toBe("crowdin-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(data.redirectUri);
    expect(data.redirectUri).toContain("/crowdin/user/oauth/callback");

    const stateParam = authorizationUrl.searchParams.get("state");
    const [state] = await db
      .select()
      .from(schema.crowdinUserOAuthStates)
      .where(eq(schema.crowdinUserOAuthStates.nonce, stateParam!))
      .limit(1);

    expect(state).toMatchObject({
      organizationId: memberAuthContext.organization.localOrganizationId,
      userId: memberAuthContext.user.localUserId,
      providerCredentialId: credential.id,
      returnTo: `/org/${memberIdentity.organization.slug}/jobs?mine=true`,
      consumedAt: null,
    });
  });

  it("exchanges Crowdin user OAuth callbacks into linked user connections", async () => {
    const adminIdentity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(adminIdentity);
    const adminAuthContext = globalThis.__testApiAuthContext!;
    await upsertCrowdinOAuthProviderCredential({
      organizationId: adminAuthContext.organization.localOrganizationId,
      userId: adminAuthContext.user.localUserId,
      role: "admin",
      displayName: "Crowdin",
      tokenBundle: {
        clientId: "crowdin-client-id",
        clientSecret: "crowdin-client-secret",
        accessToken: "org-access-token",
        refreshToken: "org-refresh-token",
        tokenType: "bearer",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    const memberIdentity = fixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    const memberHeaders = await fixture.authHeadersFor(memberIdentity);
    const memberAuthContext = globalThis.__testApiAuthContext!;
    const startResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.user.oauth.start.$post(
      {
        param: { organizationSlug: memberIdentity.organization.slug ?? "missing" },
        json: { returnTo: `/org/${memberIdentity.organization.slug}/jobs?mine=true` },
      },
      { headers: memberHeaders },
    );
    const startBody = (await startResponse.json()) as { authorizationUrl: string };
    const stateParam = new URL(startBody.authorizationUrl).searchParams.get("state");
    const [state] = await db
      .select()
      .from(schema.crowdinUserOAuthStates)
      .where(eq(schema.crowdinUserOAuthStates.nonce, stateParam!))
      .limit(1);

    let capturedTokenBody: Record<string, unknown> | undefined;
    let capturedUserHeaders: HeadersInit | undefined;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = fetchInputUrl(url);
      if (requestUrl === "https://accounts.crowdin.com/oauth/token") {
        capturedTokenBody = JSON.parse(requestBodyString(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            access_token: "user-access-token",
            refresh_token: "user-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }

      if (requestUrl === "https://api.crowdin.com/api/v2/user") {
        capturedUserHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            data: {
              id: 42,
              username: "crowdin-translator",
              email: "translator@example.com",
              fullName: "Crowdin Translator",
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await app.request(
      crowdinUserOAuthCallbackUrl(memberIdentity.organization.slug ?? "missing", {
        state: stateParam!,
        code: "user-oauth-code",
      }),
      { headers: memberHeaders },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(
      `/org/${memberIdentity.organization.slug}/jobs?mine=true&crowdin_user_connected=1`,
    );
    expect(capturedTokenBody).toMatchObject({
      grant_type: "authorization_code",
      client_id: "crowdin-client-id",
      client_secret: "crowdin-client-secret",
      code: "user-oauth-code",
      code_verifier: state!.codeVerifier,
    });
    expect(String(capturedTokenBody!.redirect_uri)).toContain("/crowdin/user/oauth/callback");
    expect(capturedUserHeaders).toEqual(
      expect.objectContaining({ Authorization: "Bearer user-access-token" }),
    );

    const [connection] = await db
      .select()
      .from(schema.crowdinUserConnections)
      .where(
        and(
          eq(
            schema.crowdinUserConnections.organizationId,
            memberAuthContext.organization.localOrganizationId,
          ),
          eq(schema.crowdinUserConnections.userId, memberAuthContext.user.localUserId),
        ),
      )
      .limit(1);
    expect(connection).toMatchObject({
      crowdinUserId: 42,
      username: "crowdin-translator",
      email: "translator@example.com",
      fullName: "Crowdin Translator",
    });
    expect(connection!.ciphertext).not.toContain("user-access-token");

    const [consumedState] = await db
      .select()
      .from(schema.crowdinUserOAuthStates)
      .where(eq(schema.crowdinUserOAuthStates.nonce, stateParam!))
      .limit(1);
    expect(consumedState!.consumedAt).not.toBeNull();
  });

  it("returns external TMS credential summaries for the requested provider", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });
    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
    });

    const summary = await getOrganizationExternalTmsProviderCredentialSummary(
      authContext.organization.localOrganizationId,
      "phrase",
    );

    expect(summary?.providerKind).toBe("phrase");
    expect(summary?.displayName).toBe("Phrase");
  });

  it("blocks non-admin mutation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "phrase",
          displayName: "Phrase",
          secretMaterial: "secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("blocks non-admin direct upsert calls", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await expect(
      upsertOrganizationExternalTmsProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: authContext.membership.role,
        providerKind: "crowdin",
        displayName: "Crowdin",
        secretMaterial: "secret",
      }),
    ).rejects.toThrow("forbidden");
  });

  it("rejects invalid provider kinds on delete", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "unknownprovider",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_external_tms_provider_kind",
    });
  });

  it("lists all external TMS credentials for the organization with enriched details", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    await db.insert(schema.projects).values({
      id: "crowdin-project-1",
      organizationId: authContext.organization.localOrganizationId,
      name: "Crowdin Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      externalTmsProviderCredentials: Array<{
        providerKind: string;
        projectCount: number;
        capabilities: Record<string, { supported: boolean; label: string }>;
      }>;
    };
    expect(data.externalTmsProviderCredentials).toHaveLength(1);
    const crowdin = data.externalTmsProviderCredentials[0];
    expect(crowdin.providerKind).toBe("crowdin");
    expect(crowdin.projectCount).toBe(1);
    expect(crowdin.capabilities["projects.read"]).toMatchObject({
      supported: true,
      label: "Read projects",
    });
  });

  it("blocks org members from listing external TMS credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: "admin",
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "lokalise-secret",
    });

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("returns connected provider health and records a health check sync run", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 200,
        headers: {
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "99",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "crowdin",
        status: "connected",
        availability: "available",
        authValidity: "valid",
        errorCode: null,
        rateLimit: {
          limit: "100",
          remaining: "99",
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crowdin.com/api/v2/user",
      expect.objectContaining({
        headers: { Authorization: "Bearer crowdin-secret" },
      }),
    );

    const [syncRun] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "crowdin"),
          eq(schema.providerSyncRuns.kind, "health_check"),
        ),
      );

    expect(syncRun?.status).toBe("succeeded");
    expect(syncRun?.providerMetadata).toMatchObject({
      status: "connected",
      authValidity: "valid",
    });
  });

  it("does not record a health check sync run when the credential is missing", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "provider_credential_not_found",
    });

    const syncRuns = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "crowdin"),
          eq(schema.providerSyncRuns.kind, "health_check"),
        ),
      );

    expect(syncRuns).toHaveLength(0);
  });

  it("rejects unsafe provider base URLs before fetching", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
      baseUrl: "https://api.crowdin.test/api/v2",
    });
    await db
      .update(schema.organizationExternalTmsProviderCredentials)
      .set({ baseUrl: "https://169.254.169.254/latest/meta-data" })
      .where(eq(schema.organizationExternalTmsProviderCredentials.id, credential.id));

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "crowdin",
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "provider_base_url_invalid",
        message: "Provider base URL is invalid.",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a generic message when provider fetch fails", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED internal.service.local");
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "crowdin",
        status: "degraded",
        availability: "unavailable",
        authValidity: "unknown",
        errorCode: "provider_unavailable",
        message: "Provider health check failed.",
      },
    });
  });

  it("returns a stable error code when provider auth is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "phrase",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "phrase",
        status: "error",
        availability: "available",
        authValidity: "invalid",
        errorCode: "provider_auth_invalid",
      },
    });

    const summary = await getOrganizationExternalTmsProviderCredentialSummary(
      authContext.organization.localOrganizationId,
      "phrase",
    );

    expect(summary?.validationStatus).toBe("error");
    expect(summary?.validationMessage).toBe("Provider rejected the stored credential.");
    expect(summary?.lastValidatedAt).not.toBeNull();
  });

  it("returns connected lokalise health via the /me endpoint", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          user_id: 420,
          email: "user@example.com",
          full_name: "Test User",
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "lokalise-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "lokalise",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "lokalise",
        status: "connected",
        availability: "available",
        authValidity: "valid",
        errorCode: null,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.com/api2/me",
      expect.objectContaining({
        headers: { "X-Api-Token": "lokalise-secret" },
      }),
    );
  });

  it("syncs crowdin projects and normalizes them into connected project records", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/projects?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1,
                  name: "Marketing Website",
                  identifier: "marketing-website",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["fr", "de"],
                  webUrl: "https://crowdin.com/project/marketing-website",
                  isSuspended: false,
                },
              },
            ],
            pagination: { offset: 0, limit: 500 },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/projects/1")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 1,
              name: "Marketing Website",
              identifier: "marketing-website",
              sourceLanguageId: "en",
              targetLanguageIds: ["fr", "de"],
              webUrl: "https://crowdin.com/project/marketing-website",
              isSuspended: false,
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/projects/1/branches")) {
        return new Response(
          JSON.stringify({
            data: [
              { data: { id: 10, name: "main", title: "Main" } },
              { data: { id: 11, name: "develop", title: null } },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      externalTmsProjectSync: {
        status: string;
        counts: {
          projectsDiscovered: number;
          projectsSynced: number;
          projectsFailed: number;
          localesSynced: number;
        };
      };
    };
    expect(data.externalTmsProjectSync.status).toBe("succeeded");
    expect(data.externalTmsProjectSync.counts).toEqual({
      projectsDiscovered: 1,
      projectsSynced: 1,
      projectsFailed: 0,
      localesSynced: 3,
    });

    const projects = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, authContext.organization.localOrganizationId),
          eq(schema.projects.externalProviderKind, "crowdin"),
        ),
      );

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: "Marketing Website",
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      externalProjectId: "1",
      externalProjectUrl: "https://crowdin.com/project/marketing-website",
      isActive: true,
      source: "external_tms",
    });

    const metadata = projects[0]?.providerMetadata as Record<string, unknown>;
    expect(metadata.identifier).toBe("marketing-website");
    expect(metadata.branches).toEqual([
      { id: 10, name: "main", title: "Main" },
      { id: 11, name: "develop", title: null },
    ]);
  });

  it("returns 404 when syncing projects without a stored credential", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "provider_credential_not_found",
    });
  });

  it("records a failed sync run when crowdin auth is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/projects?")) {
        return new Response(
          JSON.stringify({
            error: { code: 401, message: "Unauthorized" },
          }),
          { status: 401 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "invalid-token",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(500);

    const runs = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "crowdin"),
          eq(schema.providerSyncRuns.kind, "project_scan"),
        ),
      );

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("failed");
  });

  it("returns connected Smartling health and records a health check sync run", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "SUCCESS",
            data: {
              accessToken: "access-token",
              refreshToken: "refresh-token",
              expiresIn: 480,
            },
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: JSON.stringify({
        userIdentifier: "smartling-user",
        userSecret: "smartling-secret",
        accountUid: "acct-1",
      }),
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "smartling",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "smartling",
        status: "connected",
        availability: "available",
        authValidity: "valid",
        errorCode: null,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smartling.com/auth-api/v2/authenticate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          userIdentifier: "smartling-user",
          userSecret: "smartling-secret",
        }),
      }),
    );
  });

  it("returns smartling_auth_invalid when Smartling rejects credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "AUTHENTICATION_ERROR",
            errors: [{ message: "Invalid credentials" }],
          },
        }),
        { status: 401 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: "smartling-user:smartling-secret:acct-1",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "smartling",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "smartling",
        status: "error",
        authValidity: "invalid",
        errorCode: "smartling_auth_invalid",
      },
    });
  });

  it("returns smartling_api_unavailable when Smartling rejects paid API access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "FEATURE_NOT_AVAILABLE",
            errors: [{ message: "API access is not enabled on your subscription" }],
          },
        }),
        { status: 403 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: "smartling-user:smartling-secret:acct-1",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "smartling",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "smartling",
        status: "degraded",
        errorCode: "smartling_api_unavailable",
      },
    });
  });

  it("syncs Smartling projects and locales into connected TMS project records", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/accounts/acct-1/projects")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    accountUid: "acct-1",
                    projectId: "proj-1",
                    projectName: "Marketing Website",
                    sourceLocaleId: "en-US",
                    archived: false,
                    projectTypeCode: "GDN",
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing Website",
                sourceLocaleId: "en-US",
                archived: false,
                projectTypeCode: "GDN",
                targetLocales: [
                  { localeId: "de-DE", description: "German", enabled: true },
                  { localeId: "fr-FR", description: "French", enabled: true },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: JSON.stringify({
        userIdentifier: "smartling-user",
        userSecret: "smartling-secret",
        accountUid: "acct-1",
      }),
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "smartling",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      externalTmsProjectSync: {
        status: string;
        counts: {
          projectsDiscovered: number;
          projectsSynced: number;
          localesSynced: number;
        };
      };
    };
    expect(data.externalTmsProjectSync.status).toBe("succeeded");
    expect(data.externalTmsProjectSync.counts).toEqual({
      projectsDiscovered: 1,
      projectsSynced: 1,
      projectsFailed: 0,
      localesSynced: 3,
    });

    const projects = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, authContext.organization.localOrganizationId),
          eq(schema.projects.externalProviderKind, "smartling"),
        ),
      );

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: "Marketing Website",
      sourceLocale: "en-US",
      targetLocales: ["de-DE", "fr-FR"],
      externalProjectId: "proj-1",
      isActive: true,
      source: "external_tms",
    });
  });

  it("records a failed sync run when Smartling auth is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "AUTHENTICATION_ERROR",
              errors: [{ message: "Invalid credentials" }],
            },
          }),
          { status: 401 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: "smartling-user:invalid-secret:acct-1",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "smartling",
        },
      },
      { headers },
    );

    expect(response.status).toBe(500);

    const runs = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "smartling"),
          eq(schema.providerSyncRuns.kind, "project_scan"),
        ),
      );

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("failed");
  });

  it("syncs phrase projects and locales into connected TMS project records", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/projects?page=1")) {
        return new Response(
          JSON.stringify([
            {
              id: "proj-1",
              name: "Marketing Website",
              slug: "marketing-website",
              main_format: "json",
              account: { id: "acct-1", name: "Acme", slug: "acme" },
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/projects/proj-1/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "phrase",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      externalTmsProjectSync: {
        status: string;
        counts: {
          projectsDiscovered: number;
          projectsSynced: number;
          projectsFailed: number;
          localesSynced: number;
        };
      };
    };
    expect(data.externalTmsProjectSync.status).toBe("succeeded");
    expect(data.externalTmsProjectSync.counts).toEqual({
      projectsDiscovered: 1,
      projectsSynced: 1,
      projectsFailed: 0,
      localesSynced: 2,
    });

    const projects = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, authContext.organization.localOrganizationId),
          eq(schema.projects.externalProviderKind, "phrase"),
        ),
      );

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: "Marketing Website",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      externalProjectId: "proj-1",
      externalProjectUrl: "https://app.phrase.com/accounts/acme/projects/marketing-website",
      isActive: true,
      source: "external_tms",
    });
  });

  it("syncs lokalise projects and normalizes them into connected project records", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/projects?page=1") && !url.includes("/languages")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                project_id: "proj.123",
                name: "Marketing Website",
                project_type: "localization_files",
                team_id: 42,
                base_language_id: 640,
                base_language_iso: "en",
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/projects/proj.123/languages")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            languages: [
              { lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false },
              { lang_id: 673, lang_iso: "fr", lang_name: "French", is_rtl: false },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ projects: [], languages: [] }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "lokalise-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "lokalise",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      externalTmsProjectSync: {
        status: string;
        counts: {
          projectsDiscovered: number;
          projectsSynced: number;
          projectsFailed: number;
          localesSynced: number;
        };
      };
    };
    expect(data.externalTmsProjectSync.status).toBe("succeeded");
    expect(data.externalTmsProjectSync.counts).toEqual({
      projectsDiscovered: 1,
      projectsSynced: 1,
      projectsFailed: 0,
      localesSynced: 2,
    });

    const projects = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, authContext.organization.localOrganizationId),
          eq(schema.projects.externalProviderKind, "lokalise"),
        ),
      );

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      name: "Marketing Website",
      sourceLocale: "en",
      targetLocales: ["fr"],
      externalProjectId: "proj.123",
      externalProjectUrl: "https://app.lokalise.com/project/proj.123/",
      isActive: true,
      source: "external_tms",
    });
  });

  it("records a failed sync run when lokalise auth is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 401,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "invalid-token",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "lokalise",
        },
      },
      { headers },
    );

    expect(response.status).toBe(500);

    const runs = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "lokalise"),
          eq(schema.providerSyncRuns.kind, "project_scan"),
        ),
      );

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("failed");
  });

  it("blocks non-admin project sync requests", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["sync-projects"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });
});
