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
  });
});
