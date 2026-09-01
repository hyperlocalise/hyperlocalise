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
  startCanvaLocalizationMock: vi.fn(),
  getCanvaLocalizationStatusMock: vi.fn(),
  generateCanvaLocalizationMock: vi.fn(),
  getCurrentCanvaDesignJobMock: vi.fn(),
  pullLatestCanvaTranslationsMock: vi.fn(),
  resolveCanvaDesignIdMock: vi.fn(async () => "design-id"),
  verifyCanvaUserTokenMock: vi.fn(async () => ({ userId: "canva-user", brandId: "brand-1" })),
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

vi.mock("@/lib/canva/localize-design", () => ({
  startCanvaLocalization: mocks.startCanvaLocalizationMock,
  getCanvaLocalizationStatus: mocks.getCanvaLocalizationStatusMock,
  generateCanvaLocalization: mocks.generateCanvaLocalizationMock,
  getCurrentCanvaDesignJob: mocks.getCurrentCanvaDesignJobMock,
  pullLatestCanvaTranslations: mocks.pullLatestCanvaTranslationsMock,
}));

vi.mock("@/lib/canva/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canva/auth")>();
  return {
    ...actual,
    resolveCanvaDesignId: mocks.resolveCanvaDesignIdMock,
    verifyCanvaUserToken: mocks.verifyCanvaUserTokenMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createCanvaConnection } from "@/lib/canva/connections";
import { db } from "@/lib/database/client";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const client = testClient<AppType>(createApp());
const apiKeyFixture = createApiKeyTestFixture(client);
const projectFixture = createProjectTestFixture(client);

describe("canvaIntegrationRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("starts localization when the connection token is valid", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva localize key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };

    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: projectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });

    mocks.startCanvaLocalizationMock.mockResolvedValue({
      jobId: "job_test",
    });

    const response = await client.api.integrations.canva.localize.$post(
      {
        json: {
          designToken: "design-token",
          segments: [
            {
              key: "canva.segment.0.0.0",
              pageIndex: 0,
              contentIndex: 0,
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      jobId: "job_test",
      mode: "hyperlocalise",
    });
    expect(mocks.verifyCanvaUserTokenMock).toHaveBeenCalled();
    expect(mocks.startCanvaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        apiKeyId: apiKeyBody.apiKey.id,
        canvaConnectionId: created.connection.id,
        projectId: projectBody.project.id,
      }),
    );
  });

  it("scopes localization to the connection project even when projectId is sent", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva localize key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };

    const boundProjectResponse = await projectFixture.createProjectViaApi(identity);
    const boundProjectBody = (await boundProjectResponse.json()) as { project: { id: string } };
    const otherProjectResponse = await projectFixture.createProjectViaApi(identity);
    const otherProjectBody = (await otherProjectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: boundProjectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });

    mocks.startCanvaLocalizationMock.mockResolvedValue({
      jobId: "job_test",
    });

    const payload = {
      designToken: "design-token",
      projectId: otherProjectBody.project.id,
      segments: [
        {
          key: "canva.segment.0.0.0",
          pageIndex: 0,
          contentIndex: 0,
          regionIndex: 0,
          text: "Hello",
        },
      ],
    };

    const response = await client.api.integrations.canva.localize.$post(
      {
        json: payload as Parameters<typeof client.api.integrations.canva.localize.$post>[0]["json"],
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.startCanvaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: boundProjectBody.project.id,
        canvaConnectionId: created.connection.id,
      }),
    );
  });

  it("returns localization results for a completed job", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva localize key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };

    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: projectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });

    mocks.getCanvaLocalizationStatusMock.mockResolvedValue({
      jobId: "job_test",
      status: "succeeded",
      translationsByLocale: {
        es: {
          "canva.segment.0.0.0": "Hola",
        },
      },
    });

    const response = await client.api.integrations.canva.localize[":jobId"].$get(
      {
        param: {
          jobId: "job_test",
        },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: "job_test",
      status: "succeeded",
      translationsByLocale: {
        es: {
          "canva.segment.0.0.0": "Hola",
        },
      },
      mode: "hyperlocalise",
    });
    expect(mocks.getCanvaLocalizationStatusMock).toHaveBeenCalledWith({
      jobId: "job_test",
      organizationId,
      canvaConnectionId: created.connection.id,
      projectId: projectBody.project.id,
      apiKeyId: apiKeyBody.apiKey.id,
    });
  });

  it("rejects localize requests without a connection token", async () => {
    const response = await client.api.integrations.canva.localize.$post({
      json: {
        designToken: "design-token",
        segments: [
          {
            key: "canva.segment.0.0.0",
            pageIndex: 0,
            contentIndex: 0,
            regionIndex: 0,
            text: "Hello",
          },
        ],
      },
    });

    expect(response.status).toBe(401);
  });

  it("rejects localize requests without a Canva user token", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva localize key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: projectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });

    const response = await client.api.integrations.canva.localize.$post(
      {
        json: {
          designToken: "design-token",
          segments: [
            {
              key: "canva.segment.0.0.0",
              pageIndex: 0,
              contentIndex: 0,
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
        },
      },
    );

    expect(response.status).toBe(401);
    expect(mocks.startCanvaLocalizationMock).not.toHaveBeenCalled();
  });

  it("creates a claim and returns a pending poll until authorized", async () => {
    const created = await client.api.integrations.canva.claims.$post();
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      claimId: string;
      pollToken: string;
      authorizeUrl: string;
    };
    expect(body.claimId).toBeTruthy();
    expect(body.pollToken.startsWith("hl_canva_claim_")).toBe(true);
    expect(body.authorizeUrl).toContain("/connect/canva?claimId=");

    const pending = await client.api.integrations.canva.claims[":claimId"].$get(
      { param: { claimId: body.claimId } },
      { headers: { "X-Hyperlocalise-Claim-Token": body.pollToken } },
    );
    expect(pending.status).toBe(200);
    await expect(pending.json()).resolves.toEqual(
      expect.objectContaining({
        status: "pending",
      }),
    );
  });

  it("returns the connected workspace session", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva session key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string; name: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva session",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: projectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });

    const response = await client.api.integrations.canva.session.$get(
      {},
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { project: { id: string }; connection: { id: string } };
    };
    expect(body.session.project.id).toBe(projectBody.project.id);
    expect(body.session.connection.id).toBe(created.connection.id);
  });

  it("creates a job through the Figma-style jobs API", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const apiKeyResponse = await apiKeyFixture.createApiKeyViaApi(identity, {
      name: "Canva jobs key",
    });
    const apiKeyBody = (await apiKeyResponse.json()) as { apiKey: { id: string } };
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva jobs",
      apiKeyId: apiKeyBody.apiKey.id,
      projectId: projectBody.project.id,
      sourceLocale: "en",
      targetLocales: ["es"],
    });

    mocks.startCanvaLocalizationMock.mockResolvedValue({
      jobId: "job_created",
      generated: false,
      projectId: projectBody.project.id,
      sourcePath: "canva/design-id.json",
    });

    const response = await client.api.integrations.canva.jobs.$post(
      {
        json: {
          designToken: "design-token",
          generate: false,
          segments: [
            {
              key: "canva.segment.0.0.0",
              pageIndex: 0,
              contentIndex: 0,
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: {
        jobId: "job_created",
        generated: false,
        projectId: projectBody.project.id,
        sourcePath: "canva/design-id.json",
      },
    });
    expect(mocks.startCanvaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generate: false,
        projectId: projectBody.project.id,
      }),
    );
  });
});
