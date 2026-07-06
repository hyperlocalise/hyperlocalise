import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import {
  EXAMPLE_CROWDIN_ENTERPRISE_API_BASE_URL,
  EXAMPLE_CROWDIN_ENTERPRISE_AUTHENTICATED_USER_URL,
} from "@/lib/providers/adapters/crowdin/crowdin-test-urls";
import { getLokaliseOAuthScopeString } from "@/lib/providers/adapters/lokalise/lokalise-oauth-scopes";
import { getPhraseOAuthScopeString } from "@/lib/providers/adapters/phrase/phrase-oauth-scopes";
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

describe("externalTmsProviderCredentialRoutes", () => {
  beforeAll(async () => {
    await import("@/lib/database").then(({ db }) => db.$client.query("select 1"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("saves Crowdin OAuth app credentials without starting user OAuth", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Crowdin",
          oauthClientId: "crowdin-client-id",
          oauthClientSecret: "crowdin-client-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      shouldConnectCrowdinUser: boolean;
      authorizationUrl?: string;
      redirectUri?: string;
    };
    expect(body.shouldConnectCrowdinUser).toBe(true);
    expect(body.authorizationUrl).toBeUndefined();
    expect(body.redirectUri).toBeUndefined();

    const oauthStates = await db
      .select()
      .from(schema.crowdinUserOAuthStates)
      .where(
        and(
          eq(schema.crowdinUserOAuthStates.organizationId, auth.organization.localOrganizationId),
          eq(schema.crowdinUserOAuthStates.userId, auth.user.localUserId),
        ),
      );
    expect(oauthStates).toHaveLength(0);
  });

  it("updates Crowdin OAuth app settings without requiring client credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const initialResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Crowdin Production",
          oauthClientId: "crowdin-client-id",
          oauthClientSecret: "crowdin-client-secret",
          baseUrl: "https://crowdin.test/api/v2",
        },
      },
      { headers },
    );
    expect(initialResponse.status).toBe(200);

    const updateResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Crowdin Enterprise",
          baseUrl: "https://enterprise.crowdin.test/api/v2",
        },
      },
      { headers },
    );

    expect(updateResponse.status).toBe(200);
    const body = (await updateResponse.json()) as {
      shouldConnectCrowdinUser: boolean;
      externalTmsProviderCredential: {
        displayName: string;
        baseUrl: string | null;
      };
    };
    expect(body.shouldConnectCrowdinUser).toBe(false);
    expect(body.externalTmsProviderCredential.displayName).toBe("Crowdin Enterprise");
    expect(body.externalTmsProviderCredential.baseUrl).toBe(
      "https://enterprise.crowdin.test/api/v2",
    );
  });

  it("rejects Crowdin OAuth app updates that only provide one client credential field", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Crowdin",
          oauthClientId: "crowdin-client-id",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });

  it("consumes Crowdin OAuth callback state and links the signed-in user", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const startResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Crowdin",
          oauthClientId: "crowdin-client-id",
          oauthClientSecret: "crowdin-client-secret",
        },
      },
      { headers },
    );
    expect(startResponse.status).toBe(200);

    const userStartResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.user.oauth.start.$post(
      {
        param: { organizationSlug },
        json: { returnTo: `/org/${organizationSlug}/integrations` },
      },
      { headers },
    );
    expect(userStartResponse.status).toBe(200);
    const userStartBody = (await userStartResponse.json()) as {
      authorizationUrl: string;
      redirectUri: string;
    };
    expect(new URL(userStartBody.redirectUri).pathname).toBe(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/crowdin/oauth/callback`,
    );

    const authorizationUrl = new URL(userStartBody.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://accounts.crowdin.com");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("crowdin-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(userStartBody.redirectUri);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authorizationUrl.searchParams.get("state") ?? "";

    let tokenExchangeInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://accounts.crowdin.com/oauth/token") {
          tokenExchangeInit = init;
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
        if (url === "https://api.crowdin.com/api/v2/user") {
          return new Response(
            JSON.stringify({
              data: {
                id: 12345,
                username: "crowdin-user",
                email: "crowdin-user@example.com",
                fullName: "Crowdin User",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: "unexpected_url", url }), { status: 500 });
      }),
    );

    const callbackResponse = await app.request(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/crowdin/oauth/callback?state=${encodeURIComponent(state)}&code=crowdin-code`,
      { headers },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(`/org/${organizationSlug}/integrations`);
    expect(tokenExchangeInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(tokenExchangeInit?.body).toBeTypeOf("string");
    const tokenExchangeBody = JSON.parse(tokenExchangeInit?.body as string);
    expect(tokenExchangeBody).toMatchObject({
      grant_type: "authorization_code",
      client_id: "crowdin-client-id",
      client_secret: "crowdin-client-secret",
      redirect_uri: userStartBody.redirectUri,
      code: "crowdin-code",
    });
    expect(tokenExchangeBody.code_verifier).toBeTypeOf("string");

    const [connection] = await db
      .select()
      .from(schema.crowdinUserConnections)
      .where(
        and(
          eq(schema.crowdinUserConnections.organizationId, auth.organization.localOrganizationId),
          eq(schema.crowdinUserConnections.userId, auth.user.localUserId),
        ),
      )
      .limit(1);
    expect(connection).toMatchObject({
      crowdinUserId: 12345,
      username: "crowdin-user",
      email: "crowdin-user@example.com",
      fullName: "Crowdin User",
    });

    const [oauthState] = await db
      .select()
      .from(schema.crowdinUserOAuthStates)
      .where(eq(schema.crowdinUserOAuthStates.nonce, state))
      .limit(1);
    expect(oauthState?.consumedAt).toBeInstanceOf(Date);
  });

  it("links a Crowdin user with a personal access token against the configured base URL", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"].crowdin[
      "pat-setup"
    ].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Crowdin",
          baseUrl: EXAMPLE_CROWDIN_ENTERPRISE_API_BASE_URL,
        },
      },
      { headers },
    );

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (href === EXAMPLE_CROWDIN_ENTERPRISE_AUTHENTICATED_USER_URL) {
        return Response.json({
          data: {
            id: 151,
            username: "enterprise-user",
            email: null,
            fullName: "Enterprise User",
          },
        });
      }

      throw new Error(`Unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.user.pat.$post(
      {
        param: { organizationSlug },
        json: { personalAccessToken: "enterprise-pat-token" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      crowdinUserConnection: { crowdinUserId: number; username: string };
    };
    expect(body.crowdinUserConnection).toMatchObject({
      crowdinUserId: 151,
      username: "enterprise-user",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      EXAMPLE_CROWDIN_ENTERPRISE_AUTHENTICATED_USER_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer enterprise-pat-token",
        }),
      }),
    );

    const [connection] = await db
      .select()
      .from(schema.crowdinUserConnections)
      .where(
        and(
          eq(schema.crowdinUserConnections.organizationId, auth.organization.localOrganizationId),
          eq(schema.crowdinUserConnections.userId, auth.user.localUserId),
        ),
      )
      .limit(1);
    expect(connection).toMatchObject({
      crowdinUserId: 151,
      username: "enterprise-user",
      authMode: "pat",
    });
  });

  it("returns a base URL hint when an enterprise PAT is verified against api.crowdin.com", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"].crowdin[
      "pat-setup"
    ].$post(
      {
        param: { organizationSlug },
        json: { displayName: "Crowdin" },
      },
      { headers },
    );

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (href === "https://api.crowdin.com/api/v2/user") {
        return Response.json({ error: { code: 401, message: "Unauthorized" } }, { status: 401 });
      }

      throw new Error(`Unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].crowdin.user.pat.$post(
      {
        param: { organizationSlug },
        json: { personalAccessToken: "enterprise-pat-token" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_pat_base_url_required",
    });
  });

  it("saves Phrase OAuth app credentials without accepting API tokens", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const apiTokenResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug },
        json: {
          providerKind: "phrase",
          displayName: "Phrase",
          secretMaterial: "phrase-api-token",
        },
      },
      { headers },
    );
    expect(apiTokenResponse.status).toBe(400);
    await expect(apiTokenResponse.json()).resolves.toMatchObject({
      error: "phrase_api_token_unsupported",
    });

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].phrase["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Phrase",
          oauthClientId: "phrase-client-id",
          oauthClientSecret: "phrase-client-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      shouldConnectPhraseUser: boolean;
      authorizationUrl?: string;
      redirectUri?: string;
    };
    expect(body.shouldConnectPhraseUser).toBe(true);
    expect(body.authorizationUrl).toBeUndefined();
    expect(body.redirectUri).toBeUndefined();

    const oauthStates = await db
      .select()
      .from(schema.phraseUserOAuthStates)
      .where(
        and(
          eq(schema.phraseUserOAuthStates.organizationId, auth.organization.localOrganizationId),
          eq(schema.phraseUserOAuthStates.userId, auth.user.localUserId),
        ),
      );
    expect(oauthStates).toHaveLength(0);
  });

  it("returns Phrase user connection required for Phrase OAuth health checks", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const saveResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].phrase["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Phrase",
          oauthClientId: "phrase-client-id",
          oauthClientSecret: "phrase-client-secret",
        },
      },
      { headers },
    );
    expect(saveResponse.status).toBe(200);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/phrase/health-check`,
      { method: "POST", headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "phrase",
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "phrase_user_connection_required",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consumes Phrase OAuth callback state and links the signed-in user", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const startResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].phrase["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Phrase",
          oauthClientId: "phrase-client-id",
          oauthClientSecret: "phrase-client-secret",
        },
      },
      { headers },
    );
    expect(startResponse.status).toBe(200);

    const userStartResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].phrase.user.oauth.start.$post(
      {
        param: { organizationSlug },
        json: { returnTo: `/org/${organizationSlug}/integrations` },
      },
      { headers },
    );
    expect(userStartResponse.status).toBe(200);
    const userStartBody = (await userStartResponse.json()) as {
      authorizationUrl: string;
      redirectUri: string;
    };
    expect(new URL(userStartBody.redirectUri).pathname).toBe(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/phrase/oauth/callback`,
    );

    const authorizationUrl = new URL(userStartBody.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://cloud.memsource.com");
    expect(authorizationUrl.pathname).toBe("/web/oauth/authorize");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("phrase-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(userStartBody.redirectUri);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("scope")).toBe(getPhraseOAuthScopeString());
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authorizationUrl.searchParams.get("state") ?? "";

    let tokenExchangeInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://cloud.memsource.com/web/oauth/token") {
          tokenExchangeInit = init;
          return new Response(
            JSON.stringify({
              access_token: "phrase-access-token",
              refresh_token: "phrase-refresh-token",
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200 },
          );
        }
        if (url === "https://cloud.memsource.com/web/api2/v1/auth/whoAmI") {
          return new Response(
            JSON.stringify({
              user: {
                uid: "phrase-user-uid",
                userName: "phrase-user",
                email: "phrase-user@example.com",
                firstName: "Phrase",
                lastName: "User",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: "unexpected_url", url }), { status: 500 });
      }),
    );

    const callbackResponse = await app.request(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/phrase/oauth/callback?state=${encodeURIComponent(state)}&code=phrase-code`,
      { headers },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(`/org/${organizationSlug}/integrations`);
    expect(tokenExchangeInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(tokenExchangeInit?.body).toBeInstanceOf(URLSearchParams);
    const tokenExchangeBody = tokenExchangeInit?.body as URLSearchParams;
    expect(tokenExchangeBody.get("grant_type")).toBe("authorization_code");
    expect(tokenExchangeBody.get("client_id")).toBe("phrase-client-id");
    expect(tokenExchangeBody.get("client_secret")).toBe("phrase-client-secret");
    expect(tokenExchangeBody.get("code")).toBe("phrase-code");

    const [connection] = await db
      .select()
      .from(schema.phraseUserConnections)
      .where(
        and(
          eq(schema.phraseUserConnections.organizationId, auth.organization.localOrganizationId),
          eq(schema.phraseUserConnections.userId, auth.user.localUserId),
        ),
      )
      .limit(1);
    expect(connection).toMatchObject({
      phraseUserUid: "phrase-user-uid",
      username: "phrase-user",
      email: "phrase-user@example.com",
      fullName: "Phrase User",
    });

    const [oauthState] = await db
      .select()
      .from(schema.phraseUserOAuthStates)
      .where(eq(schema.phraseUserOAuthStates.nonce, state))
      .limit(1);
    expect(oauthState?.consumedAt).toBeInstanceOf(Date);
  });

  it("saves Lokalise OAuth app credentials without accepting API tokens", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const apiTokenResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug },
        json: {
          providerKind: "lokalise",
          displayName: "Lokalise",
          secretMaterial: "lokalise-api-token",
        },
      },
      { headers },
    );
    expect(apiTokenResponse.status).toBe(400);
    await expect(apiTokenResponse.json()).resolves.toMatchObject({
      error: "lokalise_api_token_unsupported",
    });

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].lokalise["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Lokalise",
          oauthClientId: "lokalise-client-id",
          oauthClientSecret: "lokalise-client-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      shouldConnectLokaliseUser: boolean;
      authorizationUrl?: string;
      redirectUri?: string;
    };
    expect(body.shouldConnectLokaliseUser).toBe(true);
    expect(body.authorizationUrl).toBeUndefined();
    expect(body.redirectUri).toBeUndefined();

    const oauthStates = await db
      .select()
      .from(schema.lokaliseUserOAuthStates)
      .where(
        and(
          eq(schema.lokaliseUserOAuthStates.organizationId, auth.organization.localOrganizationId),
          eq(schema.lokaliseUserOAuthStates.userId, auth.user.localUserId),
        ),
      );
    expect(oauthStates).toHaveLength(0);
  });

  it("returns Lokalise user connection required for Lokalise OAuth health checks", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const saveResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].lokalise["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Lokalise",
          oauthClientId: "lokalise-client-id",
          oauthClientSecret: "lokalise-client-secret",
        },
      },
      { headers },
    );
    expect(saveResponse.status).toBe(200);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/lokalise/health-check`,
      { method: "POST", headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "lokalise",
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "lokalise_user_connection_required",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consumes Lokalise OAuth callback state and links the signed-in user", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const startResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].lokalise["oauth-app"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Lokalise",
          oauthClientId: "lokalise-client-id",
          oauthClientSecret: "lokalise-client-secret",
        },
      },
      { headers },
    );
    expect(startResponse.status).toBe(200);

    const userStartResponse = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].lokalise.user.oauth.start.$post(
      {
        param: { organizationSlug },
        json: { returnTo: `/org/${organizationSlug}/integrations` },
      },
      { headers },
    );
    expect(userStartResponse.status).toBe(200);
    const userStartBody = (await userStartResponse.json()) as {
      authorizationUrl: string;
      redirectUri: string;
    };
    expect(new URL(userStartBody.redirectUri).pathname).toBe(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/lokalise/oauth/callback`,
    );

    const authorizationUrl = new URL(userStartBody.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://app.lokalise.com");
    expect(authorizationUrl.pathname).toBe("/oauth2/auth");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("lokalise-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(userStartBody.redirectUri);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("scope")).toBe(getLokaliseOAuthScopeString());
    const state = authorizationUrl.searchParams.get("state") ?? "";

    let tokenExchangeInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://app.lokalise.com/oauth2/token") {
          tokenExchangeInit = init;
          return new Response(
            JSON.stringify({
              access_token: "lokalise-access-token",
              refresh_token: "lokalise-refresh-token",
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200 },
          );
        }
        if (url === "https://api.lokalise.com/api2/projects?page=1&limit=100") {
          return new Response(
            JSON.stringify({
              projects: [
                {
                  project_id: "123.abc",
                  name: "Lokalise Project",
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url === "https://api.lokalise.com/api2/projects/123.abc/contributors/me") {
          return new Response(
            JSON.stringify({
              contributor: {
                user_id: 98765,
                email: "lokalise-user@example.com",
                fullname: "Lokalise User",
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: "unexpected_url", url }), { status: 500 });
      }),
    );

    const callbackResponse = await app.request(
      `/api/orgs/${organizationSlug}/external-tms-provider-credential/lokalise/oauth/callback?state=${encodeURIComponent(state)}&code=lokalise-code`,
      { headers },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(`/org/${organizationSlug}/integrations`);
    expect(tokenExchangeInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(tokenExchangeInit?.body).toBeTypeOf("string");
    const tokenExchangeBody = JSON.parse(tokenExchangeInit?.body as string);
    expect(tokenExchangeBody).toMatchObject({
      grant_type: "authorization_code",
      client_id: "lokalise-client-id",
      client_secret: "lokalise-client-secret",
      redirect_uri: userStartBody.redirectUri,
      code: "lokalise-code",
    });
    expect(authorizationUrl.searchParams.has("code_challenge")).toBe(false);

    const [connection] = await db
      .select()
      .from(schema.lokaliseUserConnections)
      .where(
        and(
          eq(schema.lokaliseUserConnections.organizationId, auth.organization.localOrganizationId),
          eq(schema.lokaliseUserConnections.userId, auth.user.localUserId),
        ),
      )
      .limit(1);
    expect(connection).toMatchObject({
      lokaliseUserId: 98765,
      username: "lokalise-user@example.com",
      email: "lokalise-user@example.com",
      fullName: "Lokalise User",
    });

    const [oauthState] = await db
      .select()
      .from(schema.lokaliseUserOAuthStates)
      .where(eq(schema.lokaliseUserOAuthStates.nonce, state))
      .limit(1);
    expect(oauthState?.consumedAt).toBeInstanceOf(Date);
  });
});
