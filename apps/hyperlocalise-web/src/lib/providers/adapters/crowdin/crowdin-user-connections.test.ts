import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import {
  CROWDIN_OAUTH_TOKEN_REFRESH_BUFFER_MS,
  decryptCrowdinOAuthTokenBundle,
  upsertCrowdinOAuthProviderCredential,
  type CrowdinOAuthTokenBundle,
} from "../../organization-external-tms-provider-credentials";
import {
  getCrowdinUserConnection,
  resolveCrowdinUserConnectionSecretMaterial,
  upsertCrowdinUserConnection,
} from "./crowdin-user-connections";

const fixture = createAuthTestFixture();

function tokenBundle(overrides: Partial<CrowdinOAuthTokenBundle> = {}): CrowdinOAuthTokenBundle {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    accessToken: "fresh-access-token",
    refreshToken: "refresh-token",
    tokenType: "bearer",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

async function createCrowdinOAuthCredential() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);
  const authContext = globalThis.__testApiAuthContext!;
  const credential = await upsertCrowdinOAuthProviderCredential({
    organizationId: authContext.organization.localOrganizationId,
    userId: authContext.user.localUserId,
    role: "admin",
    displayName: "Crowdin",
    tokenBundle: tokenBundle(),
  });

  return { authContext, credential, identity };
}

describe("crowdin user connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("persists a user-level Crowdin OAuth connection summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential } = await createCrowdinOAuthCredential();

    const result = await upsertCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle(),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
        email: "crowdin-user@example.com",
        fullName: "Crowdin User",
      },
    });

    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      throw new Error("expected Crowdin user connection upsert to succeed");
    }
    expect(result.value).toMatchObject({
      crowdinUserId: 12345,
      username: "crowdin-user",
      email: "crowdin-user@example.com",
      fullName: "Crowdin User",
      oauthExpiresAt: "2026-01-01T01:00:00.000Z",
    });

    const connection = await getCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
    });
    expect(connection).toMatchObject({
      providerCredentialId: credential.id,
      crowdinUserId: 12345,
      username: "crowdin-user",
    });
  });

  it("rejects linking the same Crowdin user to another organization member", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential, identity } = await createCrowdinOAuthCredential();

    const firstResult = await upsertCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle(),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
      },
    });
    expect(isErr(firstResult)).toBe(false);

    const secondIdentity = fixture.createWorkosIdentityForOrganization(
      identity.organization,
      "admin",
    );
    await fixture.authHeadersFor(secondIdentity);
    const secondAuthContext = globalThis.__testApiAuthContext!;
    const duplicateResult = await upsertCrowdinUserConnection({
      organizationId: secondAuthContext.organization.localOrganizationId,
      userId: secondAuthContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({ accessToken: "second-access-token" }),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
      },
    });

    expect(isErr(duplicateResult)).toBe(true);
    if (!isErr(duplicateResult)) {
      throw new Error("expected duplicate Crowdin user link to fail");
    }
    expect(duplicateResult.error).toEqual({ code: "crowdin_user_already_linked" });
  });

  it("rejects duplicate Crowdin user links via DB unique constraint when pre-check races", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential, identity } = await createCrowdinOAuthCredential();

    const firstResult = await upsertCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle(),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
      },
    });
    expect(isErr(firstResult)).toBe(false);

    const secondIdentity = fixture.createWorkosIdentityForOrganization(
      identity.organization,
      "admin",
    );
    await fixture.authHeadersFor(secondIdentity);
    const secondAuthContext = globalThis.__testApiAuthContext!;

    const selectSpy = vi.spyOn(db, "select").mockImplementationOnce((_fields) => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve([]),
      };
      return chain as unknown as ReturnType<typeof db.select>;
    });

    try {
      const duplicateResult = await upsertCrowdinUserConnection({
        organizationId: authContext.organization.localOrganizationId,
        userId: secondAuthContext.user.localUserId,
        providerCredentialId: credential.id,
        tokenBundle: tokenBundle({ accessToken: "second-access-token" }),
        crowdinUser: {
          id: 12345,
          username: "crowdin-user",
        },
      });

      expect(isErr(duplicateResult)).toBe(true);
      if (!isErr(duplicateResult)) {
        throw new Error("expected duplicate Crowdin user link to fail via unique constraint");
      }
      expect(duplicateResult.error).toEqual({ code: "crowdin_user_already_linked" });
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("returns fresh user access tokens without refreshing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const nearExpiry = new Date(Date.now() + CROWDIN_OAUTH_TOKEN_REFRESH_BUFFER_MS + 30_000);
    const { authContext, credential } = await createCrowdinOAuthCredential();
    const upsertResult = await upsertCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({
        accessToken: "user-access-token",
        expiresAt: nearExpiry.toISOString(),
      }),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
      },
    });
    expect(isErr(upsertResult)).toBe(false);
    const connection = await getCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
    });
    expect(connection).not.toBeNull();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const accessToken = await resolveCrowdinUserConnectionSecretMaterial({
      connection: connection!,
      fetchFn: fetchMock,
    });

    expect(accessToken).toBe("user-access-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes expired user access tokens and persists the new token bundle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential } = await createCrowdinOAuthCredential();
    const upsertResult = await upsertCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({
        accessToken: "expired-access-token",
        refreshToken: "old-refresh-token",
        expiresAt: "2025-12-31T23:00:00.000Z",
      }),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
      },
    });
    expect(isErr(upsertResult)).toBe(false);
    const connection = await getCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
    });
    expect(connection).not.toBeNull();
    let refreshInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      refreshInit = init;
      return new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
          expires_in: 7200,
        }),
        { status: 200 },
      );
    });

    const accessToken = await resolveCrowdinUserConnectionSecretMaterial({
      connection: connection!,
      fetchFn: fetchMock,
    });

    expect(accessToken).toBe("new-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refreshInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
    });
    expect(JSON.parse(refreshInit?.body as string)).toEqual({
      grant_type: "refresh_token",
      client_id: "client-id",
      client_secret: "client-secret",
      refresh_token: "old-refresh-token",
    });

    const [updatedConnection] = await db
      .select()
      .from(schema.crowdinUserConnections)
      .where(eq(schema.crowdinUserConnections.id, connection!.id))
      .limit(1);
    expect(updatedConnection!.oauthExpiresAt?.toISOString()).toBe("2026-01-01T02:00:00.000Z");
    expect(decryptCrowdinOAuthTokenBundle(updatedConnection!)).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: "2026-01-01T02:00:00.000Z",
    });
  });

  it("propagates Crowdin refresh failures for expired user tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential } = await createCrowdinOAuthCredential();
    const upsertResult = await upsertCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({
        accessToken: "expired-access-token",
        expiresAt: "2025-12-31T23:00:00.000Z",
      }),
      crowdinUser: {
        id: 12345,
        username: "crowdin-user",
      },
    });
    expect(isErr(upsertResult)).toBe(false);
    const connection = await getCrowdinUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
    });
    expect(connection).not.toBeNull();
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 });
    });

    await expect(
      resolveCrowdinUserConnectionSecretMaterial({
        connection: connection!,
        fetchFn: fetchMock,
      }),
    ).rejects.toThrow("crowdin_oauth_refresh_failed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
