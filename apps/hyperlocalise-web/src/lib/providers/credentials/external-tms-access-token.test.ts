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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { isErr } from "@/lib/primitives/result/results";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import {
  upsertCrowdinOAuthProviderCredential,
  upsertCrowdinPatProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

import {
  ExternalTmsAccessTokenError,
  mintExternalTmsAccessToken,
} from "./external-tms-access-token";

const fixture = createAuthTestFixture();

async function adminAuth() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);
  return globalThis.__testApiAuthContext!;
}

describe("mintExternalTmsAccessToken", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/database/client");
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("returns 404 when the organization has no credential", async () => {
    const auth = await adminAuth();

    await expect(
      mintExternalTmsAccessToken({
        organizationId: auth.organization.localOrganizationId,
        providerKind: "phrase",
      }),
    ).rejects.toMatchObject({
      code: "provider_credential_not_found",
      status: 404,
    });
  });

  it("mints a Phrase Strings API token without calling Phrase", async () => {
    const auth = await adminAuth();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      role: "admin",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-api-token",
    });
    const fetchMock = vi.fn();

    const token = await mintExternalTmsAccessToken({
      organizationId: auth.organization.localOrganizationId,
      providerKind: "phrase",
      credentialId: credential.id,
      fetchFn: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(token).toMatchObject({
      providerKind: "phrase",
      credentialId: credential.id,
      authMode: "api_token",
      headerName: "Authorization",
      headerValue: "token phrase-api-token",
      expiresAt: null,
      probeUrl: "https://api.phrase.com/v2/user",
    });
    expect(JSON.stringify(token)).not.toMatch(/refresh/i);
  });

  it("exchanges Smartling user secrets for an access token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const auth = await adminAuth();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      role: "admin",
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: JSON.stringify({
        userIdentifier: "user-1",
        userSecret: "secret-1",
      }),
    });

    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toContain("/auth-api/v2/authenticate");
      return new Response(
        JSON.stringify({
          response: {
            code: "SUCCESS",
            data: {
              accessToken: "smartling-access",
              refreshToken: "smartling-refresh",
              expiresIn: 3600,
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const token = await mintExternalTmsAccessToken({
      organizationId: auth.organization.localOrganizationId,
      providerKind: "smartling",
      fetchFn: fetchMock,
    });

    expect(token).toMatchObject({
      providerKind: "smartling",
      credentialId: credential.id,
      headerName: "Authorization",
      headerValue: "Bearer smartling-access",
      expiresAt: "2026-01-01T01:00:00.000Z",
      probeUrl: null,
    });
    expect(JSON.stringify(token)).not.toContain("secret-1");
    expect(JSON.stringify(token)).not.toContain("smartling-refresh");
  });

  it("requires a Crowdin user connection for OAuth credentials", async () => {
    const auth = await adminAuth();
    await upsertCrowdinOAuthProviderCredential({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      role: "admin",
      displayName: "Crowdin",
      oauthClient: {
        clientId: "client-id",
        clientSecret: "client-secret",
      },
    });

    await expect(
      mintExternalTmsAccessToken({
        organizationId: auth.organization.localOrganizationId,
        providerKind: "crowdin",
      }),
    ).rejects.toBeInstanceOf(ExternalTmsAccessTokenError);
    await expect(
      mintExternalTmsAccessToken({
        organizationId: auth.organization.localOrganizationId,
        providerKind: "crowdin",
      }),
    ).rejects.toMatchObject({ code: "crowdin_user_connection_required", status: 400 });
  });

  it("mints a Crowdin PAT from the signed-in member connection", async () => {
    const auth = await adminAuth();
    const credential = await upsertCrowdinPatProviderCredential({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      role: "admin",
      displayName: "Crowdin",
      baseUrl: "https://api.crowdin.com/api/v2",
    });
    const upsert = await crowdinAuth.upsertUserPatConnection({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      providerCredentialId: credential.id,
      personalAccessToken: "crowdin-pat",
      crowdinUser: { id: 42, username: "translator" },
    });
    expect(isErr(upsert)).toBe(false);

    const token = await mintExternalTmsAccessToken({
      organizationId: auth.organization.localOrganizationId,
      providerKind: "crowdin",
      actorUserId: auth.user.localUserId,
    });

    expect(token).toMatchObject({
      providerKind: "crowdin",
      credentialId: credential.id,
      authMode: "pat",
      headerName: "Authorization",
      headerValue: "Bearer crowdin-pat",
      expiresAt: null,
      probeUrl: "https://api.crowdin.com/api/v2/user",
    });
  });
});
