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
  pullFigmaPageLocaleContentMock: vi.fn(),
  reconcileWorkosMembershipsForUserMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/lib/figma/localize-file", () => ({
  startFigmaLocalization: mocks.startFigmaLocalizationMock,
  getFigmaLocalizationStatus: mocks.getFigmaLocalizationStatusMock,
  getCurrentFigmaPageJob: mocks.getCurrentFigmaPageJobMock,
  generateFigmaLocalization: mocks.generateFigmaLocalizationMock,
  pullFigmaPageLocaleContent: mocks.pullFigmaPageLocaleContentMock,
}));

vi.mock("@/api/auth/workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-membership-reconcile")>();

  return {
    ...actual,
    reconcileWorkosMembershipsForUser: mocks.reconcileWorkosMembershipsForUserMock,
  };
});

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createApiKeyTestFixture } from "@/api/routes/api-key/api-key.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { createFigmaConnection } from "@/lib/figma/connections";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";

const client = testClient<AppType>(createApp());
const apiKeyFixture = createApiKeyTestFixture();
const projectFixture = createProjectTestFixture(client);

const sampleSegment = {
  key: "figma.k.01TESTSEGMENTKEY",
  nodeId: "1:2",
  regionIndex: 0,
  text: "Hello",
};

describe("figmaIntegrationRoutes", () => {
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

  it("returns health without auth", async () => {
    const response = await client.api.integrations.figma.health.$get();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      figmaOauthConfigured: Boolean(env.FIGMA_OAUTH_CLIENT_ID),
    });
  });

  it("allows Figma plugin origins on OPTIONS", async () => {
    const figmaOrigin = "https://www.figma.com";
    const allowed = await createApp().request("http://localhost/api/integrations/figma/session", {
      method: "OPTIONS",
      headers: { Origin: figmaOrigin },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(figmaOrigin);
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "x-hyperlocalise-connection-token",
    );
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "x-hyperlocalise-access-token",
    );

    const denied = await createApp().request("http://localhost/api/integrations/figma/health", {
      method: "GET",
      headers: { Origin: "https://evil.example" },
    });
    expect(denied.status).toBe(200);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects session requests without a connection or access token", async () => {
    const response = await client.api.integrations.figma.session.$get();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: "figma_connection_token_required" });
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

  it("rejects unknown connection tokens", async () => {
    const response = await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Connection-Token": "hl_figma_unknown_token_value",
      },
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "figma_connection_not_found" });
  });

  it("returns the connected workspace session", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma session key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma session",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    const response = await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Connection-Token": created.connectionToken,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { project: { id: string }; connection: { id: string } };
    };
    expect(body.session.project.id).toBe(projectBody.project.id);
    expect(body.session.connection.id).toBe(created.connection.id);
  });

  it("returns an unbound session and lists org projects", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma unbound key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as {
      project: { id: string; name: string };
    };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma unbound",
      apiKeyId: apiKey.id,
    });

    const response = await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Connection-Token": created.connectionToken,
      },
    });

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

  it("creates a job when the connection token is valid and a project is bound", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma jobs key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma jobs",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    mocks.startFigmaLocalizationMock.mockResolvedValue({
      jobId: "job_created",
      generated: false,
      projectId: projectBody.project.id,
      sourcePath: "figma/file-key/page-id.json",
    });

    const response = await client.api.integrations.figma.jobs.$post(
      {
        json: {
          fileKey: "file-key",
          pageId: "page-id",
          generate: false,
          segments: [sampleSegment],
        },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
        },
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: {
        jobId: "job_created",
        generated: false,
        projectId: projectBody.project.id,
        sourcePath: "figma/file-key/page-id.json",
      },
    });
    expect(mocks.startFigmaLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generate: false,
        projectId: projectBody.project.id,
        fileKey: "file-key",
        pageId: "page-id",
      }),
    );
  });

  it("rejects job creation until a project is bound", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma unbound jobs key",
    });

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma unbound jobs",
      apiKeyId: apiKey.id,
    });

    const response = await client.api.integrations.figma.jobs.$post(
      {
        json: {
          fileKey: "file-key",
          pageId: "page-id",
          generate: true,
          segments: [sampleSegment],
        },
      },
      {
        headers: {
          "X-Hyperlocalise-Connection-Token": created.connectionToken,
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "figma_project_not_bound" });
  });

  it("pulls translations for a bound project", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma pull key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma pull",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    mocks.pullFigmaPageLocaleContentMock.mockResolvedValue({
      kind: "job",
      translations: {
        jobId: "job_pull",
        status: "completed",
        translationsByLocale: { "fr-FR": { [sampleSegment.key]: "Bonjour" } },
      },
    });

    const response = await client.api.integrations.figma.translations.$get(
      {
        query: {
          projectId: projectBody.project.id,
          fileKey: "file-key",
          pageId: "page-id",
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
      translations: {
        jobId: "job_pull",
        status: "completed",
        translationsByLocale: { "fr-FR": { [sampleSegment.key]: "Bonjour" } },
      },
    });
  });

  it("pulls source page content when locale matches project source", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma source pull key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma source pull",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    mocks.pullFigmaPageLocaleContentMock.mockResolvedValue({
      kind: "source",
      sourcePage: {
        locale: "en-US",
        sourcePath: "figma/files/file-key/pages/page-1.json",
        needsReupload: false,
        entries: [{ key: sampleSegment.key, source: "Hello", knownTexts: ["Hola"] }],
      },
    });

    const response = await client.api.integrations.figma.translations.$get(
      {
        query: {
          projectId: projectBody.project.id,
          fileKey: "file-key",
          pageId: "page-id",
          locale: "en-US",
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
      sourcePage: {
        locale: "en-US",
        sourcePath: "figma/files/file-key/pages/page-1.json",
        needsReupload: false,
        entries: [{ key: sampleSegment.key, source: "Hello", knownTexts: ["Hola"] }],
      },
    });
  });

  it("updates lastUsedAt on the Figma connection after a successful request", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma usage key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma usage",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    const [untouched] = await db
      .select({ lastUsedAt: schema.figmaConnections.lastUsedAt })
      .from(schema.figmaConnections)
      .where(eq(schema.figmaConnections.id, created.connection.id));
    expect(untouched?.lastUsedAt).toBeNull();

    await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Connection-Token": created.connectionToken,
      },
    });

    const [touched] = await db
      .select({ lastUsedAt: schema.figmaConnections.lastUsedAt })
      .from(schema.figmaConnections)
      .where(eq(schema.figmaConnections.id, created.connection.id));
    expect(touched?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects disabled connections", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Figma disabled key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createFigmaConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Figma disabled",
      apiKeyId: apiKey.id,
      projectId: projectBody.project.id,
    });

    const disableResponse = await client.api.orgs[":organizationSlug"]["figma-connections"][
      ":connectionId"
    ].$patch(
      {
        param: { organizationSlug, connectionId: created.connection.id },
        json: { enabled: false },
      },
      { headers },
    );
    expect(disableResponse.status).toBe(200);

    const response = await client.api.integrations.figma.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Connection-Token": created.connectionToken,
      },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "figma_connection_disabled" });
  });
});
