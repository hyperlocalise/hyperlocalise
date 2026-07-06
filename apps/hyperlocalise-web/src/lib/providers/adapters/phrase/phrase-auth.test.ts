import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import {
  PHRASE_OAUTH_TOKEN_REFRESH_BUFFER_MS,
  decryptPhraseOAuthTokenBundle,
  upsertPhraseOAuthProviderCredential,
  type PhraseOAuthTokenBundle,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import {
  getPhraseUserConnection,
  resolvePhraseUserConnectionSecretMaterial,
  upsertPhraseUserConnection,
} from "./phrase-auth";

const fixture = createAuthTestFixture();

function tokenBundle(overrides: Partial<PhraseOAuthTokenBundle> = {}): PhraseOAuthTokenBundle {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    accessToken: "fresh-access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

async function createPhraseOAuthCredential() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);
  const authContext = globalThis.__testApiAuthContext!;
  const credential = await upsertPhraseOAuthProviderCredential({
    organizationId: authContext.organization.localOrganizationId,
    userId: authContext.user.localUserId,
    role: "admin",
    displayName: "Phrase",
    oauthClient: {
      clientId: "client-id",
      clientSecret: "client-secret",
    },
  });

  return { authContext, credential, identity };
}

describe("phrase user connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("persists a user-level Phrase OAuth connection summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential } = await createPhraseOAuthCredential();

    const result = await upsertPhraseUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle(),
      phraseUser: {
        uid: "phrase-user-uid",
        username: "phrase-user",
        email: "phrase-user@example.com",
        fullName: "Phrase User",
      },
    });

    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      throw new Error("expected Phrase user connection upsert to succeed");
    }
    expect(result.value).toMatchObject({
      phraseUserUid: "phrase-user-uid",
      username: "phrase-user",
      email: "phrase-user@example.com",
      fullName: "Phrase User",
      oauthExpiresAt: "2026-01-01T01:00:00.000Z",
    });

    const connection = await getPhraseUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
    });
    expect(connection).toMatchObject({
      providerCredentialId: credential.id,
      phraseUserUid: "phrase-user-uid",
      username: "phrase-user",
    });
  });

  it("rejects linking the same Phrase user to another organization member", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential, identity } = await createPhraseOAuthCredential();

    const firstResult = await upsertPhraseUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle(),
      phraseUser: {
        uid: "phrase-user-uid",
        username: "phrase-user",
      },
    });
    expect(isErr(firstResult)).toBe(false);

    const secondIdentity = fixture.createWorkosIdentityForOrganization(
      identity.organization,
      "admin",
    );
    await fixture.authHeadersFor(secondIdentity);
    const secondAuthContext = globalThis.__testApiAuthContext!;
    const duplicateResult = await upsertPhraseUserConnection({
      organizationId: secondAuthContext.organization.localOrganizationId,
      userId: secondAuthContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({ accessToken: "second-access-token" }),
      phraseUser: {
        uid: "phrase-user-uid",
        username: "phrase-user",
      },
    });

    expect(isErr(duplicateResult)).toBe(true);
    if (!isErr(duplicateResult)) {
      throw new Error("expected duplicate Phrase user link to fail");
    }
    expect(duplicateResult.error).toEqual({ code: "phrase_user_already_linked" });
  });

  it("returns fresh user bearer tokens without refreshing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const nearExpiry = new Date(Date.now() + PHRASE_OAUTH_TOKEN_REFRESH_BUFFER_MS + 30_000);
    const { authContext, credential } = await createPhraseOAuthCredential();
    const upsertResult = await upsertPhraseUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({
        accessToken: "user-access-token",
        expiresAt: nearExpiry.toISOString(),
      }),
      phraseUser: {
        uid: "phrase-user-uid",
        username: "phrase-user",
      },
    });
    expect(isErr(upsertResult)).toBe(false);
    const connection = await getPhraseUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
    });
    expect(connection).not.toBeNull();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    const accessToken = await resolvePhraseUserConnectionSecretMaterial({
      connection: connection!,
      fetchFn: fetchMock,
    });

    expect(accessToken).toBe("Bearer user-access-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes expired user access tokens and persists the new token bundle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { authContext, credential } = await createPhraseOAuthCredential();
    const upsertResult = await upsertPhraseUserConnection({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      providerCredentialId: credential.id,
      tokenBundle: tokenBundle({
        accessToken: "expired-access-token",
        refreshToken: "old-refresh-token",
        expiresAt: "2025-12-31T23:00:00.000Z",
      }),
      phraseUser: {
        uid: "phrase-user-uid",
        username: "phrase-user",
      },
    });
    expect(isErr(upsertResult)).toBe(false);
    const connection = await getPhraseUserConnection({
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
          token_type: "Bearer",
          expires_in: 7200,
        }),
        { status: 200 },
      );
    });

    const accessToken = await resolvePhraseUserConnectionSecretMaterial({
      connection: connection!,
      fetchFn: fetchMock,
    });

    expect(accessToken).toBe("Bearer new-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refreshInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "error",
    });
    expect(refreshInit?.body).toBeInstanceOf(URLSearchParams);
    const refreshBody = refreshInit?.body as URLSearchParams;
    expect(refreshBody.get("grant_type")).toBe("refresh_token");
    expect(refreshBody.get("refresh_token")).toBe("old-refresh-token");

    const [updatedConnection] = await db
      .select()
      .from(schema.phraseUserConnections)
      .where(eq(schema.phraseUserConnections.id, connection!.id))
      .limit(1);
    expect(updatedConnection!.oauthExpiresAt?.toISOString()).toBe("2026-01-01T02:00:00.000Z");
    expect(decryptPhraseOAuthTokenBundle(updatedConnection!)).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: "2026-01-01T02:00:00.000Z",
    });
  });
});
