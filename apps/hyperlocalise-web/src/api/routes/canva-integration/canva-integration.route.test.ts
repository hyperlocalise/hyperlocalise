import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  startCanvaLocalizationMock: vi.fn(),
  getCanvaLocalizationStatusMock: vi.fn(),
  resolveCanvaDesignIdMock: vi.fn(async () => "design-id"),
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
}));

vi.mock("@/lib/canva/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canva/auth")>();
  return {
    ...actual,
    resolveCanvaDesignId: mocks.resolveCanvaDesignIdMock,
  };
});

import { createApp } from "@/api/app";
import { createCanvaConnection } from "@/lib/canva/connections";
import { db } from "@/lib/database";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const client = testClient(createApp());
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
        },
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      jobId: "job_test",
      mode: "hyperlocalise",
    });
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
});
