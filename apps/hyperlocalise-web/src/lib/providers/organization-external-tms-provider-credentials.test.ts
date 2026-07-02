import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";
import {
  decryptCrowdinOAuthTokenBundle,
  mapCrowdinOAuthTokenResponse,
  mapLokaliseOAuthTokenResponse,
  mapPhraseOAuthTokenResponse,
  resolveExternalTmsSecretMaterial,
  upsertCrowdinOAuthProviderCredential,
  upsertCrowdinPatProviderCredential,
  upsertLokaliseOAuthProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
  upsertPhraseOAuthProviderCredential,
} from "./organization-external-tms-provider-credentials";
import {
  EXAMPLE_CROWDIN_ENTERPRISE_API_BASE_URL,
} from "./adapters/crowdin/crowdin-test-urls";
import {
  getCrowdinUserConnection,
  upsertCrowdinUserConnection,
} from "./adapters/crowdin/crowdin-user-connections";

const fixture = createAuthTestFixture();

describe("organization external TMS provider credentials", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  describe("mapCrowdinOAuthTokenResponse", () => {
    it("maps Crowdin OAuth token responses into persisted token bundles", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const tokenBundle = mapCrowdinOAuthTokenResponse(
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        },
        {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      );

      expect(tokenBundle).toEqual({
        clientId: "client-id",
        clientSecret: "client-secret",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "bearer",
        expiresAt: "2026-01-01T01:00:00.000Z",
      });
    });

    it("rejects malformed Crowdin OAuth token responses", () => {
      expect(() =>
        mapCrowdinOAuthTokenResponse(
          {
            refresh_token: "refresh-token",
            expires_in: 3600,
          },
          {
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ),
      ).toThrow("crowdin_oauth_token_response_invalid");

      expect(() =>
        mapCrowdinOAuthTokenResponse(
          {
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 0,
          },
          {
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ),
      ).toThrow("crowdin_oauth_token_response_invalid");
    });
  });

  describe("mapPhraseOAuthTokenResponse", () => {
    it("maps Phrase OAuth token responses into persisted token bundles", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const tokenBundle = mapPhraseOAuthTokenResponse(
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
        {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      );

      expect(tokenBundle).toEqual({
        clientId: "client-id",
        clientSecret: "client-secret",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        expiresAt: "2026-01-01T01:00:00.000Z",
      });
    });

    it("keeps the previous Phrase refresh token when refresh responses omit one", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const tokenBundle = mapPhraseOAuthTokenResponse(
        {
          access_token: "access-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
        {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "old-refresh-token",
        },
      );

      expect(tokenBundle.refreshToken).toBe("old-refresh-token");
    });

    it("rejects malformed Phrase OAuth token responses", () => {
      expect(() =>
        mapPhraseOAuthTokenResponse(
          {
            refresh_token: "refresh-token",
            expires_in: 3600,
          },
          {
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ),
      ).toThrow("phrase_oauth_token_response_invalid");

      expect(() =>
        mapPhraseOAuthTokenResponse(
          {
            access_token: "access-token",
            expires_in: 0,
          },
          {
            clientId: "client-id",
            clientSecret: "client-secret",
            refreshToken: "old-refresh-token",
          },
        ),
      ).toThrow("phrase_oauth_token_response_invalid");
    });
  });

  describe("mapLokaliseOAuthTokenResponse", () => {
    it("maps Lokalise OAuth token responses into persisted token bundles", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const tokenBundle = mapLokaliseOAuthTokenResponse(
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
        {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      );

      expect(tokenBundle).toEqual({
        clientId: "client-id",
        clientSecret: "client-secret",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        expiresAt: "2026-01-01T01:00:00.000Z",
      });
    });

    it("keeps the previous Lokalise refresh token when refresh responses omit one", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const tokenBundle = mapLokaliseOAuthTokenResponse(
        {
          access_token: "access-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
        {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "old-refresh-token",
        },
      );

      expect(tokenBundle.refreshToken).toBe("old-refresh-token");
    });

    it("rejects malformed Lokalise OAuth token responses", () => {
      expect(() =>
        mapLokaliseOAuthTokenResponse(
          {
            refresh_token: "refresh-token",
            expires_in: 3600,
          },
          {
            clientId: "client-id",
            clientSecret: "client-secret",
          },
        ),
      ).toThrow("lokalise_oauth_token_response_invalid");

      expect(() =>
        mapLokaliseOAuthTokenResponse(
          {
            access_token: "access-token",
            expires_in: 0,
          },
          {
            clientId: "client-id",
            clientSecret: "client-secret",
            refreshToken: "old-refresh-token",
          },
        ),
      ).toThrow("lokalise_oauth_token_response_invalid");
    });
  });

  describe("partial OAuth app settings updates", () => {
    it("updates Crowdin display name and base URL without replacing encrypted OAuth client material", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;

      const credential = await upsertCrowdinOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin Production",
        oauthClient: {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
        baseUrl: "https://crowdin.test/api/v2",
      });

      const updated = await upsertCrowdinOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin Enterprise",
        baseUrl: "https://enterprise.crowdin.test/api/v2",
      });

      expect(updated.id).toBe(credential.id);
      expect(updated.displayName).toBe("Crowdin Enterprise");
      expect(updated.baseUrl).toBe("https://enterprise.crowdin.test/api/v2");
      expect(updated.ciphertext).toBe(credential.ciphertext);
      expect(updated.iv).toBe(credential.iv);
      expect(updated.authTag).toBe(credential.authTag);
      expect(updated.keyVersion).toBe(credential.keyVersion);
    });

    it("requires OAuth client material when creating a new Phrase integration", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;

      await expect(
        upsertPhraseOAuthProviderCredential({
          organizationId: authContext.organization.localOrganizationId,
          userId: authContext.user.localUserId,
          role: "admin",
          displayName: "Phrase",
        }),
      ).rejects.toThrow("phrase_oauth_client_required");
    });

    it("updates Lokalise settings while preserving existing OAuth client material", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;

      const credential = await upsertLokaliseOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Lokalise",
        oauthClient: {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      });

      const updated = await upsertLokaliseOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Lokalise EU",
      });

      expect(updated.id).toBe(credential.id);
      expect(updated.displayName).toBe("Lokalise EU");
      expect(updated.ciphertext).toBe(credential.ciphertext);
    });

    it("replaces encrypted OAuth material when switching Crowdin to PAT mode", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;

      const credential = await upsertCrowdinOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin Production",
        oauthClient: {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
        baseUrl: "https://crowdin.test/api/v2",
      });

      const updated = await upsertCrowdinPatProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin Production",
        baseUrl: "https://crowdin.test/api/v2",
      });

      expect(updated.id).toBe(credential.id);
      expect(updated.authMode).toBe("pat");
      expect(updated.maskedSecretSuffix).toBe("pat");
      expect(updated.ciphertext).not.toBe(credential.ciphertext);
      expect(() => decryptCrowdinOAuthTokenBundle(updated)).toThrow("crowdin_oauth_token_invalid");

      const secretMaterial = unwrapProviderCredentialCrypto(
        decryptProviderCredential({
          algorithm: updated.encryptionAlgorithm,
          keyVersion: updated.keyVersion,
          ciphertext: updated.ciphertext,
          iv: updated.iv,
          authTag: updated.authTag,
        }),
      );
      expect(JSON.parse(secretMaterial)).toEqual({ kind: "crowdin_pat" });
    });

    it("removes Crowdin user connections when switching between OAuth and PAT mode", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;

      const credential = await upsertCrowdinOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin Production",
        oauthClient: {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
        tokenBundle: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "fresh-access-token",
          refreshToken: "refresh-token",
          tokenType: "bearer",
          expiresAt: "2026-01-01T01:00:00.000Z",
        },
        baseUrl: "https://crowdin.test/api/v2",
      });

      const upsertResult = await upsertCrowdinUserConnection({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        providerCredentialId: credential.id,
        tokenBundle: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "user-access-token",
          refreshToken: "user-refresh-token",
          tokenType: "bearer",
          expiresAt: "2026-01-01T01:00:00.000Z",
        },
        crowdinUser: {
          id: 12345,
          username: "crowdin-user",
        },
      });
      expect(isErr(upsertResult)).toBe(false);

      await upsertCrowdinPatProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin Production",
        baseUrl: "https://crowdin.test/api/v2",
      });

      const connection = await getCrowdinUserConnection({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
      });
      expect(connection).toBeNull();
    });
  });

  describe("resolveExternalTmsSecretMaterial", () => {
    it("requires a user connection for Crowdin OAuth access tokens", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;
      const credential = await upsertCrowdinOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin",
        tokenBundle: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "fresh-access-token",
          refreshToken: "refresh-token",
          tokenType: "bearer",
          expiresAt: "2026-01-01T01:00:00.000Z",
        },
      });
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

      await expect(
        resolveExternalTmsSecretMaterial({ credential, fetchFn: fetchMock }),
      ).rejects.toThrow("crowdin_user_connection_required");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not refresh deprecated org Crowdin OAuth token bundles", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;
      const credential = await upsertCrowdinOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Crowdin",
        tokenBundle: {
          clientId: "client-id",
          clientSecret: "client-secret",
          accessToken: "expired-access-token",
          refreshToken: "old-refresh-token",
          tokenType: "bearer",
          expiresAt: "2025-12-31T23:00:00.000Z",
        },
      });
      const fetchMock = vi.fn(async () => {
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

      await expect(
        resolveExternalTmsSecretMaterial({ credential, fetchFn: fetchMock }),
      ).rejects.toThrow("crowdin_user_connection_required");
      expect(fetchMock).not.toHaveBeenCalled();

      const [updatedCredential] = await db
        .select()
        .from(schema.organizationExternalTmsProviderCredentials)
        .where(eq(schema.organizationExternalTmsProviderCredentials.id, credential.id))
        .limit(1);
      expect(updatedCredential!.oauthExpiresAt).toBeNull();
    });

    it("requires a user connection for Phrase OAuth access tokens", async () => {
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
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

      await expect(
        resolveExternalTmsSecretMaterial({ credential, fetchFn: fetchMock }),
      ).rejects.toThrow("phrase_user_connection_required");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires a user connection for Lokalise OAuth access tokens", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;
      const credential = await upsertLokaliseOAuthProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        displayName: "Lokalise",
        oauthClient: {
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      });
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

      await expect(
        resolveExternalTmsSecretMaterial({ credential, fetchFn: fetchMock }),
      ).rejects.toThrow("lokalise_user_connection_required");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects legacy Crowdin api_token credentials", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      await fixture.authHeadersFor(identity);
      const authContext = globalThis.__testApiAuthContext!;
      const credential = await upsertOrganizationExternalTmsProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: "admin",
        providerKind: "crowdin",
        displayName: "Crowdin",
        secretMaterial: "legacy-shared-token",
        baseUrl: EXAMPLE_CROWDIN_ENTERPRISE_API_BASE_URL,
      });
      const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

      await expect(
        resolveExternalTmsSecretMaterial({ credential, fetchFn: fetchMock }),
      ).rejects.toThrow("crowdin_legacy_api_token_deprecated");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
