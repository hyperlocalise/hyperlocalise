import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
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
});
