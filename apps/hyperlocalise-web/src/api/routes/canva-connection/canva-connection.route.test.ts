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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
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
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import { createCanvaConnectionClaim } from "@/lib/canva/connection-claims";
import { db } from "@/lib/database/client";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const client = testClient(createApp());
const apiKeyFixture = createApiKeyTestFixture(client);
const projectFixture = createProjectTestFixture(client);

describe("canvaConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("creates a Canva connection with a one-time connection token", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva Connection Key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };

    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const response = await client.api.orgs[":organizationSlug"]["canva-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Marketing Canva",
          apiKeyId: apiKeyBody.apiKey.id,
          projectId: projectBody.project.id,
          sourceLocale: "en",
          targetLocales: ["es", "fr"],
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      canvaConnection: { displayName: string; connectionTokenPrefix: string };
      connectionToken: string;
    };
    expect(body.canvaConnection.displayName).toBe("Marketing Canva");
    expect(body.connectionToken).toMatch(/^hl_canva_/);
    expect(body.canvaConnection.connectionTokenPrefix).toBe(body.connectionToken.slice(0, 12));
  });

  it("rejects Canva connection creation for members without write access", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("member");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["canva-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Blocked",
          apiKeyId: "00000000-0000-4000-8000-000000000001",
          projectId: "project_test",
          sourceLocale: "en",
          targetLocales: ["es"],
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("authorizes a pending Canva claim onto a connection", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva Claim Key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await client.api.orgs[":organizationSlug"]["canva-connections"].$post(
      {
        param: { organizationSlug },
        json: {
          displayName: "Claim Canva",
          apiKeyId: apiKeyBody.apiKey.id,
          projectId: projectBody.project.id,
          sourceLocale: "en",
          targetLocales: ["es"],
        },
      },
      { headers },
    );
    const createdBody = (await created.json()) as {
      canvaConnection: { id: string };
    };
    const claim = await createCanvaConnectionClaim();

    const response = await client.api.orgs[":organizationSlug"]["canva-connections"][
      ":connectionId"
    ]["complete-claim"].$post(
      {
        param: { organizationSlug, connectionId: createdBody.canvaConnection.id },
        json: { claimId: claim.claimId },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { claimId: string };
    expect(body.claimId).toBe(claim.claimId);

    const authorized = await client.api.integrations.canva.claims[":claimId"].$get(
      { param: { claimId: claim.claimId } },
      { headers: { "X-Hyperlocalise-Claim-Token": claim.pollToken } },
    );
    expect(authorized.status).toBe(200);
    const authorizedBody = (await authorized.json()) as {
      status: string;
      connectionToken?: string;
    };
    expect(authorizedBody.status).toBe("authorized");
    expect(authorizedBody.connectionToken).toMatch(/^hl_canva_/);

    const consumed = await client.api.integrations.canva.claims[":claimId"].$get(
      { param: { claimId: claim.claimId } },
      { headers: { "X-Hyperlocalise-Claim-Token": claim.pollToken } },
    );
    expect(consumed.status).toBe(200);
    await expect(consumed.json()).resolves.toEqual({ status: "consumed" });
  });
});
