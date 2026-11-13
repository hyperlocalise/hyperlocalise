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

import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { app } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { env } from "@/lib/env";
import { GO_SVC_SERVICE_TOKEN_HEADER } from "@/lib/go-svc/go-svc-service-token";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

const fixture = createAuthTestFixture();

function serviceHeaders() {
  const password = env.WORKOS_COOKIE_PASSWORD;
  if (!password) {
    throw new Error("WORKOS_COOKIE_PASSWORD is required for internal TMS route tests");
  }
  return {
    "content-type": "application/json",
    [GO_SVC_SERVICE_TOKEN_HEADER]: createHmac("sha256", password)
      .update("go-svc-research")
      .digest("hex"),
  };
}

describe("internal TMS access-token route", () => {
  beforeAll(async () => {
    const { db } = await import("@/lib/database/client");
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("rejects requests without the go-svc service token", async () => {
    const response = await app.request("/api/internal/tms/access-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "00000000-0000-4000-8000-000000000000",
        providerKind: "phrase",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("rejects a wrong service token", async () => {
    const response = await app.request("/api/internal/tms/access-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [GO_SVC_SERVICE_TOKEN_HEADER]: "deadbeef",
      },
      body: JSON.stringify({
        organizationId: "00000000-0000-4000-8000-000000000000",
        providerKind: "phrase",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid body after the service token is accepted", async () => {
    const response = await app.request("/api/internal/tms/access-token", {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ providerKind: "phrase" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_tms_access_token_payload",
    });
  });

  it("mints a Phrase API token for go-svc", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      role: "admin",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-api-token",
    });

    const response = await app.request("/api/internal/tms/access-token", {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        organizationId: auth.organization.localOrganizationId,
        providerKind: "phrase",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      tmsAccessToken: {
        headerName: string;
        headerValue: string;
        probeUrl: string;
      };
    };
    expect(body.tmsAccessToken.headerName).toBe("Authorization");
    expect(body.tmsAccessToken.headerValue).toBe("token phrase-api-token");
    expect(body.tmsAccessToken.probeUrl).toBe("https://api.phrase.com/v2/user");
  });
});
