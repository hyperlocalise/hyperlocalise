import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import {
  mapCrowdinOAuthTokenResponse,
  resolveExternalTmsSecretMaterial,
  upsertCrowdinOAuthProviderCredential,
} from "./organization-external-tms-provider-credentials";

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

  describe("resolveExternalTmsSecretMaterial", () => {
    it("returns fresh Crowdin OAuth access tokens without refreshing", async () => {
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
      ).resolves.toBe("fresh-access-token");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refreshes expired Crowdin OAuth access tokens and persists the replacement", async () => {
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
      ).resolves.toBe("new-access-token");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://accounts.crowdin.com/oauth/token",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            grant_type: "refresh_token",
            client_id: "client-id",
            client_secret: "client-secret",
            refresh_token: "old-refresh-token",
          }),
        }),
      );

      const [updatedCredential] = await db
        .select()
        .from(schema.organizationExternalTmsProviderCredentials)
        .where(eq(schema.organizationExternalTmsProviderCredentials.id, credential.id))
        .limit(1);
      const secondFetchMock = vi.fn(async () => {
        throw new Error("should not refresh a fresh persisted token");
      });

      await expect(
        resolveExternalTmsSecretMaterial({
          credential: updatedCredential!,
          fetchFn: secondFetchMock,
        }),
      ).resolves.toBe("new-access-token");
      expect(secondFetchMock).not.toHaveBeenCalled();
      expect(updatedCredential!.oauthExpiresAt?.toISOString()).toBe("2026-01-01T02:00:00.000Z");
    });
  });
});
