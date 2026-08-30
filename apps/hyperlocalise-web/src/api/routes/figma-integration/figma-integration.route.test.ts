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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  startFigmaLocalizationMock: vi.fn(),
  getFigmaLocalizationStatusMock: vi.fn(),
  getCurrentFigmaPageJobMock: vi.fn(),
  generateFigmaLocalizationMock: vi.fn(),
  pullLatestFigmaTranslationsMock: vi.fn(),
  reconcileWorkosMembershipsForUserMock: vi.fn(),
}));

vi.mock("@/lib/figma/localize-file", () => ({
  startFigmaLocalization: mocks.startFigmaLocalizationMock,
  getFigmaLocalizationStatus: mocks.getFigmaLocalizationStatusMock,
  getCurrentFigmaPageJob: mocks.getCurrentFigmaPageJobMock,
  generateFigmaLocalization: mocks.generateFigmaLocalizationMock,
  pullLatestFigmaTranslations: mocks.pullLatestFigmaTranslationsMock,
}));

vi.mock("@/api/auth/workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-membership-reconcile")>();

  return {
    ...actual,
    reconcileWorkosMembershipsForUser: mocks.reconcileWorkosMembershipsForUserMock,
  };
});

import { createApp } from "@/api/app";
import { INVALID_OR_REVOKED_API_KEY_MESSAGE } from "@/api/auth/api-key";
import { FIGMA_API_KEY_HEADER } from "@/api/auth/figma-cors";
import {
  cleanupPublicApiFixture,
  createPublicApiFixture,
} from "@/api/routes/public-jobs/public-jobs.fixture";
import { db, schema } from "@/lib/database/client";

const client = testClient(createApp());

const FIGMA_PERMISSIONS = ["files:read", "jobs:read", "jobs:write"];

function apiKeyHeaders(apiKey: string) {
  return {
    headers: {
      [FIGMA_API_KEY_HEADER]: apiKey,
    },
  };
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  mocks.reconcileWorkosMembershipsForUserMock.mockResolvedValue({ status: "skipped" });
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanupPublicApiFixture();
});

describe("figmaIntegrationRoutes", () => {
  it("returns health without auth", async () => {
    const response = await client.api.integrations.figma.health.$get();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects session requests without an API key", async () => {
    const response = await client.api.integrations.figma.session.$get();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: "unauthorized" });
  });

  it("rejects legacy sealed-session and bearer authentication", async () => {
    const sealed = await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Figma-Session": "sealed.session.value",
        "X-Hyperlocalise-Organization-Slug": "acme",
      },
    });
    expect(sealed.status).toBe(401);

    const bearer = await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        Authorization: "Bearer sealed.session.from.bearer",
      },
    });
    expect(bearer.status).toBe(401);
  });

  it("returns the same 401 for unknown, malformed, and revoked tokens", async () => {
    const { apiKey, apiKeyId } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });

    const unknown = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders("hl_unknown_token"),
    );
    expect(unknown.status).toBe(401);
    const unknownBody = await unknown.json();
    expect(unknownBody).toEqual({
      error: "unauthorized",
      message: INVALID_OR_REVOKED_API_KEY_MESSAGE,
    });
    expect(JSON.stringify(unknownBody)).not.toContain("hl_unknown_token");

    const malformed = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders("not-a-pat"),
    );
    expect(malformed.status).toBe(401);

    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.organizationApiKeys.id, apiKeyId));

    const revoked = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders(apiKey),
    );
    expect(revoked.status).toBe(401);
    const revokedBody = await revoked.json();
    expect(revokedBody).toMatchObject({
      error: "unauthorized",
      message: INVALID_OR_REVOKED_API_KEY_MESSAGE,
    });
    expect(JSON.stringify(revokedBody)).not.toContain(apiKey);
  });

  it("rejects API keys for archived workspaces", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });

    await db
      .update(schema.organizations)
      .set({ lifecycleStatus: "archived", archivedAt: new Date() })
      .where(eq(schema.organizations.id, project.organizationId));

    const response = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders(apiKey),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "workspace_archived",
    });
  });

  it("allows Figma plugin origins and x-api-key on OPTIONS", async () => {
    const allowed = await createApp().request("http://localhost/api/integrations/figma/health", {
      method: "OPTIONS",
      headers: { Origin: "https://www.figma.com" },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://www.figma.com");
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "x-api-key",
    );
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).not.toContain(
      "authorization",
    );

    const denied = await createApp().request("http://localhost/api/integrations/figma/health", {
      method: "GET",
      headers: { Origin: "https://evil.example" },
    });
    expect(denied.status).toBe(200);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns the PAT owner session and accessible projects", async () => {
    const { apiKey, project, user } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });

    const sessionResponse = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders(apiKey),
    );
    expect(sessionResponse.status).toBe(200);
    const sessionBody = await sessionResponse.json();
    expect(sessionBody).toMatchObject({
      session: {
        user: { email: user.email, localUserId: user.id },
        organization: { id: project.organizationId },
      },
    });
    expect(sessionBody).not.toHaveProperty("session.organizations");
    expect(JSON.stringify(sessionBody)).not.toContain(apiKey);

    const projectsResponse = await client.api.integrations.figma.projects.$get(
      undefined,
      apiKeyHeaders(apiKey),
    );
    expect(projectsResponse.status).toBe(200);
    await expect(projectsResponse.json()).resolves.toEqual({
      projects: [
        {
          id: project.id,
          name: project.name,
          sourceLocale: project.sourceLocale ?? "en",
          targetLocales: project.targetLocales ?? [],
        },
      ],
    });
  });

  it("isolates projects to the PAT owner's organization and team access", async () => {
    const owner = await createPublicApiFixture({ permissions: FIGMA_PERMISSIONS });
    const other = await createPublicApiFixture({ permissions: FIGMA_PERMISSIONS });

    const response = await client.api.integrations.figma.projects.$get(
      undefined,
      apiKeyHeaders(owner.apiKey),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: Array<{ id: string }> };
    expect(body.projects.map((project) => project.id)).toEqual([owner.project.id]);
    expect(body.projects.map((project) => project.id)).not.toContain(other.project.id);
  });

  it("enforces least-required PAT permissions", async () => {
    const readOnly = await createPublicApiFixture({
      permissions: ["files:read", "jobs:read"],
    });
    const jobsOnly = await createPublicApiFixture({
      permissions: ["jobs:read", "jobs:write"],
    });

    const projectsDenied = await client.api.integrations.figma.projects.$get(
      undefined,
      apiKeyHeaders(jobsOnly.apiKey),
    );
    expect(projectsDenied.status).toBe(403);
    await expect(projectsDenied.json()).resolves.toMatchObject({ error: "forbidden" });

    mocks.startFigmaLocalizationMock.mockResolvedValue({
      jobId: "job_figma",
      generated: true,
      projectId: readOnly.project.id,
      sourcePath: "figma/files/fileKey123/pages/12:34.json",
    });

    const createDenied = await client.api.integrations.figma.jobs.$post(
      {
        json: {
          projectId: readOnly.project.id,
          fileKey: "fileKey123",
          pageId: "12:34",
          sourceLocale: "en",
          targetLocales: ["es"],
          generate: true,
          segments: [
            {
              key: "figma.segment.1:1.0",
              nodeId: "1:1",
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      apiKeyHeaders(readOnly.apiKey),
    );
    expect(createDenied.status).toBe(403);
    expect(mocks.startFigmaLocalizationMock).not.toHaveBeenCalled();

    const translationsDenied = await client.api.integrations.figma.translations.$get(
      { query: { projectId: jobsOnly.project.id, fileKey: "fileKey123", pageId: "12:34" } },
      apiKeyHeaders(jobsOnly.apiKey),
    );
    expect(translationsDenied.status).toBe(403);
  });

  it("intersects token scopes with the owner's current role", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
      role: "member",
    });

    const projectsAllowed = await client.api.integrations.figma.projects.$get(
      undefined,
      apiKeyHeaders(apiKey),
    );
    expect(projectsAllowed.status).toBe(200);

    mocks.startFigmaLocalizationMock.mockResolvedValue({
      jobId: "job_figma",
      generated: true,
      projectId: project.id,
      sourcePath: "figma/files/fileKey123/pages/12:34.json",
    });

    const createDenied = await client.api.integrations.figma.jobs.$post(
      {
        json: {
          projectId: project.id,
          fileKey: "fileKey123",
          pageId: "12:34",
          sourceLocale: "en",
          targetLocales: ["es"],
          generate: true,
          segments: [
            {
              key: "figma.segment.1:1.0",
              nodeId: "1:1",
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      apiKeyHeaders(apiKey),
    );
    expect(createDenied.status).toBe(403);
    expect(mocks.startFigmaLocalizationMock).not.toHaveBeenCalled();
  });

  it("creates a job from extracted Figma segments", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });
    mocks.startFigmaLocalizationMock.mockResolvedValue({
      jobId: "job_figma",
      generated: true,
      projectId: project.id,
      sourcePath: "figma/files/fileKey123/pages/12:34.json",
    });

    const response = await client.api.integrations.figma.jobs.$post(
      {
        json: {
          projectId: project.id,
          fileKey: "fileKey123",
          pageId: "12:34",
          sourceLocale: "en",
          targetLocales: ["es"],
          generate: true,
          segments: [
            {
              key: "figma.segment.1:1.0",
              nodeId: "1:1",
              regionIndex: 0,
              text: "Hello",
            },
          ],
        },
      },
      apiKeyHeaders(apiKey),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: {
        jobId: "job_figma",
        generated: true,
        projectId: project.id,
        sourcePath: "figma/files/fileKey123/pages/12:34.json",
      },
    });
    expect(mocks.startFigmaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        fileKey: "fileKey123",
        pageId: "12:34",
        generate: true,
        auth: expect.objectContaining({
          user: expect.objectContaining({ localUserId: expect.any(String) }),
          organization: expect.objectContaining({ localOrganizationId: project.organizationId }),
        }),
      }),
    );
  });

  it("polls job status and pulls latest translations", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });
    mocks.getFigmaLocalizationStatusMock.mockResolvedValue({
      jobId: "job_figma",
      status: "succeeded",
      projectId: project.id,
      sourcePath: "figma/files/fileKey123/pages/12:34.json",
      targetLocales: ["es"],
      lastError: null,
      translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
    });
    mocks.generateFigmaLocalizationMock.mockResolvedValue({ jobId: "job_figma" });
    mocks.pullLatestFigmaTranslationsMock.mockResolvedValue({
      jobId: "job_figma",
      status: "waiting_for_review",
      projectId: project.id,
      sourcePath: "figma/files/fileKey123/pages/12:34.json",
      targetLocales: ["es"],
      lastError: null,
      translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
    });

    const statusResponse = await client.api.integrations.figma.jobs[":jobId"].$get(
      { param: { jobId: "job_figma" } },
      apiKeyHeaders(apiKey),
    );
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      job: { status: "succeeded" },
    });

    const generateResponse = await client.api.integrations.figma.jobs[":jobId"].generate.$post(
      { param: { jobId: "job_figma" } },
      apiKeyHeaders(apiKey),
    );
    expect(generateResponse.status).toBe(202);

    const pullResponse = await client.api.integrations.figma.translations.$get(
      { query: { projectId: project.id, fileKey: "fileKey123", pageId: "12:34" } },
      apiKeyHeaders(apiKey),
    );
    expect(pullResponse.status).toBe(200);
    await expect(pullResponse.json()).resolves.toMatchObject({
      translations: { status: "waiting_for_review" },
    });
    expect(mocks.pullLatestFigmaTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        fileKey: "fileKey123",
        pageId: "12:34",
      }),
    );
  });

  it("returns the current page job for a Figma file and page", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });
    mocks.getCurrentFigmaPageJobMock.mockResolvedValue({
      job: {
        jobId: "job_figma",
        status: "queued",
        projectId: project.id,
        sourcePath: "figma/files/fileKey123/pages/12:34.json",
        targetLocales: ["es"],
        lastError: null,
        translationsByLocale: {},
      },
    });

    const response = await client.api.integrations.figma.jobs.current.$get(
      { query: { projectId: project.id, fileKey: "fileKey123", pageId: "12:34" } },
      apiKeyHeaders(apiKey),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: { jobId: "job_figma", status: "queued" },
    });
    expect(mocks.getCurrentFigmaPageJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        fileKey: "fileKey123",
        pageId: "12:34",
      }),
    );
  });

  it("looks up the current page job across the org when projectId is omitted", async () => {
    const { apiKey } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });
    mocks.getCurrentFigmaPageJobMock.mockResolvedValue({ job: null });

    const response = await client.api.integrations.figma.jobs.current.$get(
      { query: { fileKey: "fileKey123", pageId: "12:34" } },
      apiKeyHeaders(apiKey),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job: null });
    expect(mocks.getCurrentFigmaPageJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileKey: "fileKey123",
        pageId: "12:34",
      }),
    );
    expect(mocks.getCurrentFigmaPageJobMock.mock.calls[0]?.[0].projectId).toBeUndefined();
  });

  it("returns failed Figma jobs as a 200 status body", async () => {
    const { apiKey, project } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });
    mocks.getFigmaLocalizationStatusMock.mockResolvedValue({
      jobId: "job_figma",
      status: "failed",
      projectId: project.id,
      sourcePath: "figma/files/fileKey123/pages/12:34.json",
      targetLocales: ["es"],
      lastError: "provider_timeout",
      translationsByLocale: {},
    });

    const response = await client.api.integrations.figma.jobs[":jobId"].$get(
      { param: { jobId: "job_figma" } },
      apiKeyHeaders(apiKey),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: { status: "failed", lastError: "provider_timeout" },
    });
  });

  it("updates lastUsedAt after a successful Figma request", async () => {
    const { apiKey, apiKeyId } = await createPublicApiFixture({
      permissions: FIGMA_PERMISSIONS,
    });

    const rejected = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders("hl_unknown_token_does_not_exist"),
    );
    expect(rejected.status).toBe(401);

    const [untouched] = await db
      .select({ lastUsedAt: schema.organizationApiKeys.lastUsedAt })
      .from(schema.organizationApiKeys)
      .where(eq(schema.organizationApiKeys.id, apiKeyId))
      .limit(1);
    expect(untouched?.lastUsedAt).toBeNull();

    const allowed = await client.api.integrations.figma.session.$get(
      undefined,
      apiKeyHeaders(apiKey),
    );
    expect(allowed.status).toBe(200);

    await vi.waitFor(async () => {
      const [touched] = await db
        .select({ lastUsedAt: schema.organizationApiKeys.lastUsedAt })
        .from(schema.organizationApiKeys)
        .where(eq(schema.organizationApiKeys.id, apiKeyId))
        .limit(1);
      expect(touched?.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  it("does not expose the Figma OAuth callback path", async () => {
    const response = await createApp().request("http://localhost/api/auth/figma/authorize");
    expect(response.status).toBe(404);
  });
});
