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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  enqueueActivityLogEventMock: vi.fn().mockResolvedValue({
    ok: true,
    value: { createdAt: new Date(), id: "activity-event-1" },
  }),
  enqueueActivityLogEventsMock: vi.fn().mockResolvedValue([]),
  startCanvaLocalizationMock: vi.fn(),
  collectCanvaDesignMock: vi.fn(),
  generateCanvaLocaleJobsMock: vi.fn(),
  listCanvaDesignLocaleStatusesMock: vi.fn(),
  pullCanvaLocalePageTranslationsMock: vi.fn(),
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
  reconcileWorkosMembershipsForUserMock: vi.fn(),
}));

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvent: mocks.enqueueActivityLogEventMock,
  enqueueActivityLogEvents: mocks.enqueueActivityLogEventsMock,
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/api/auth/workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-membership-reconcile")>();

  return {
    ...actual,
    reconcileWorkosMembershipsForUser: mocks.reconcileWorkosMembershipsForUserMock,
  };
});

vi.mock("@/lib/canva/localize-design", () => ({
  startCanvaLocalization: mocks.startCanvaLocalizationMock,
  collectCanvaDesign: mocks.collectCanvaDesignMock,
  generateCanvaLocaleJobs: mocks.generateCanvaLocaleJobsMock,
  listCanvaDesignLocaleStatuses: mocks.listCanvaDesignLocaleStatusesMock,
  pullCanvaLocalePageTranslations: mocks.pullCanvaLocalePageTranslationsMock,
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
const apiKeyFixture = createApiKeyTestFixture();
const projectFixture = createProjectTestFixture(client);

describe("canvaIntegrationRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.reconcileWorkosMembershipsForUserMock.mockResolvedValue({ status: "skipped" });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await apiKeyFixture.cleanup();
    await projectFixture.cleanup();
  });

  it("allows Canva Apps iframe origins on OPTIONS", async () => {
    const previewOrigin = "https://app-aahognqjkw4.canva-apps.com";
    const allowed = await createApp().request("http://localhost/api/integrations/canva/session", {
      method: "OPTIONS",
      headers: { Origin: previewOrigin },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(previewOrigin);
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "authorization",
    );
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "x-hyperlocalise-access-token",
    );

    const denied = await createApp().request("http://localhost/api/integrations/canva/health", {
      method: "GET",
      headers: { Origin: "https://evil.example" },
    });
    expect(denied.status).toBe(200);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("starts localization when the connection token is valid", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva localize key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
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
        apiKeyId: apiKey.id,
        canvaConnectionId: created.connection.id,
        projectId: projectBody.project.id,
      }),
    );
  });

  it("collects page files and lists locale status", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva collect key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    mocks.collectCanvaDesignMock.mockResolvedValue({
      designSlug: "marketing-flyer",
      projectId: projectBody.project.id,
      pages: [
        {
          pageIndex: 0,
          sourcePath: "canva/designs/marketing-flyer/page-0.json",
          sourceFileId: "file_1",
          segmentCount: 1,
        },
      ],
    });
    mocks.listCanvaDesignLocaleStatusesMock.mockResolvedValue({
      locales: [
        {
          locale: "es",
          status: "idle",
          translated: 0,
          total: 1,
          percent: 0,
          canAdd: false,
          pages: [],
        },
      ],
      pages: [],
      designId: "design-id",
    });

    const collectResponse = await client.api.integrations.canva.collect.$post(
      {
        json: {
          designToken: "design-token",
          designTitle: "Marketing flyer",
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

    expect(collectResponse.status).toBe(201);
    await expect(collectResponse.json()).resolves.toEqual({
      designSlug: "marketing-flyer",
      projectId: projectBody.project.id,
      pages: [
        {
          pageIndex: 0,
          sourcePath: "canva/designs/marketing-flyer/page-0.json",
          sourceFileId: "file_1",
          segmentCount: 1,
        },
      ],
    });
    expect(mocks.collectCanvaDesignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId: projectBody.project.id,
        designId: "design-id",
        designTitle: "Marketing flyer",
      }),
    );

    const localesResponse = await client.api.integrations.canva.locales.$get(
      {
        query: { designToken: "design-token" },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );

    expect(localesResponse.status).toBe(200);
    await expect(localesResponse.json()).resolves.toEqual({
      locales: [
        {
          locale: "es",
          status: "idle",
          translated: 0,
          total: 1,
          percent: 0,
          canAdd: false,
          pages: [],
        },
      ],
      pages: [],
      designId: "design-id",
    });
  });

  it("scopes localization to the connection project even when projectId is sent", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva localize key",
    });
    const boundProjectResponse = await projectFixture.createProjectViaApi(identity);
    const boundProjectBody = (await boundProjectResponse.json()) as { project: { id: string } };
    const otherProjectResponse = await projectFixture.createProjectViaApi(identity);
    const otherProjectBody = (await otherProjectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKey.id,
      projectId: boundProjectBody.project.id,
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

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva localize key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
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
      apiKeyId: apiKey.id,
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

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva localize key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva test",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
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

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva session key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string; name: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva session",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
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

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva jobs key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva jobs",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
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

  it("returns an unbound session and lists org projects", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva session key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as {
      project: { id: string; name: string };
    };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva unbound",
      apiKeyId: apiKey.id,
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
      session: {
        project: { id: string } | null;
        projects: Array<{ id: string; name: string }>;
      };
    };
    expect(body.session.project).toBeNull();
    expect(body.session.projects.map((project) => project.id)).toContain(projectBody.project.id);
  });

  it("rejects collect until a project is bound, then collects after bind", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Canva bind key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };
    const created = await createCanvaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Canva bind",
      apiKeyId: apiKey.id,
    });

    const unboundCollect = await client.api.integrations.canva.collect.$post(
      {
        json: {
          designToken: "design-token",
          designTitle: "Marketing flyer",
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
    expect(unboundCollect.status).toBe(400);
    await expect(unboundCollect.json()).resolves.toEqual(
      expect.objectContaining({ error: "canva_project_not_bound" }),
    );

    const bindResponse = await client.api.integrations.canva.project.$post(
      { json: { projectId: projectBody.project.id } },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
          Authorization: "Bearer canva-user-jwt",
        },
      },
    );
    expect(bindResponse.status).toBe(200);
    const bindBody = (await bindResponse.json()) as {
      session: { project: { id: string } | null };
    };
    expect(bindBody.session.project?.id).toBe(projectBody.project.id);

    mocks.collectCanvaDesignMock.mockResolvedValue({
      designSlug: "marketing-flyer",
      projectId: projectBody.project.id,
      pages: [],
    });

    const collectResponse = await client.api.integrations.canva.collect.$post(
      {
        json: {
          designToken: "design-token",
          designTitle: "Marketing flyer",
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
    expect(collectResponse.status).toBe(201);
    expect(mocks.collectCanvaDesignMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: projectBody.project.id,
      }),
    );
  });
});
