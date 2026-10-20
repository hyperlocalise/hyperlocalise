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
  collectSanityPageMock: vi.fn(),
  listSanityPageLocaleStatusesMock: vi.fn(),
  startSanityLocalizationMock: vi.fn(),
  getSanityLocalizationStatusMock: vi.fn(),
  getCurrentSanityPageJobMock: vi.fn(),
  generateSanityLocalizationMock: vi.fn(),
  generateSanityLocaleJobsMock: vi.fn(),
  pullSanityPageLocaleContentMock: vi.fn(),
  importSanityPluginTargetTranslationsMock: vi.fn(),
  getAccessibleSanityProjectMock: vi.fn(),
  reconcileWorkosMembershipsForUserMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/lib/sanity/localize-document", () => ({
  collectSanityDocument: mocks.collectSanityPageMock,
  listSanityDocumentLocaleStatuses: mocks.listSanityPageLocaleStatusesMock,
  startSanityLocalization: mocks.startSanityLocalizationMock,
  getSanityLocalizationStatus: mocks.getSanityLocalizationStatusMock,
  getCurrentSanityDocumentJob: mocks.getCurrentSanityPageJobMock,
  generateSanityLocalization: mocks.generateSanityLocalizationMock,
  generateSanityLocaleJobs: mocks.generateSanityLocaleJobsMock,
  pullSanityDocumentLocaleContent: mocks.pullSanityPageLocaleContentMock,
  importSanityPluginTargetTranslations: mocks.importSanityPluginTargetTranslationsMock,
  getAccessibleSanityProject: mocks.getAccessibleSanityProjectMock,
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
import { createSanityConnection } from "@/lib/sanity/connections";
import { issueSanityOauthTokens } from "@/lib/sanity/oauth";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";

const client = testClient<AppType>(createApp());
const apiKeyFixture = createApiKeyTestFixture();
const projectFixture = createProjectTestFixture(client);

const SANITY_PROJECT_ID = "abc123";
const SANITY_DATASET = "production";
const DOCUMENT_ID = "doc-id";
const DOCUMENT_TYPE = "article";

const SOURCE_PATH = `sanity/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${DOCUMENT_TYPE}/${DOCUMENT_ID}.json`;
const STUDIO_ORIGIN = "http://localhost:3333";

const sampleSegment = {
  key: "sanity.k.01TESTSEGMENTKEY",
  documentId: DOCUMENT_ID,
  documentType: DOCUMENT_TYPE,
  text: "Hello",
};

function sanityDocumentFields() {
  return {
    sanityProjectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    documentId: DOCUMENT_ID,
    documentType: DOCUMENT_TYPE,
  };
}

async function accessTokenHeaders(input: {
  connectionId: string;
  userId: string;
  organizationId: string;
}) {
  const tokens = await issueSanityOauthTokens({ ...input, studioOrigin: STUDIO_ORIGIN });
  return {
    "X-Hyperlocalise-Access-Token": tokens.accessToken,
    Origin: STUDIO_ORIGIN,
  };
}

describe("sanityIntegrationRoutes", () => {
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
    const response = await client.api.integrations.sanity.health.$get();
    expect(response.status).toBe(200);
    const sanityOauthConfigured = Boolean(env.SANITY_OAUTH_CLIENT_ID);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sanityOauthConfigured,
      ...(sanityOauthConfigured && env.SANITY_OAUTH_CLIENT_ID
        ? { sanityOauthClientId: env.SANITY_OAUTH_CLIENT_ID }
        : {}),
    });
  });

  it("allows Sanity plugin origins on OPTIONS", async () => {
    const sanityOrigin = "http://localhost:3333";
    const allowed = await createApp().request("http://localhost/api/integrations/sanity/session", {
      method: "OPTIONS",
      headers: { Origin: sanityOrigin },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(sanityOrigin);
    expect(allowed.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "x-hyperlocalise-access-token",
    );

    const denied = await createApp().request("http://localhost/api/integrations/sanity/health", {
      method: "GET",
      headers: { Origin: "https://evil.example" },
    });
    expect(denied.status).toBe(200);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects session requests without an access token", async () => {
    const response = await client.api.integrations.sanity.session.$get();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: "sanity_access_token_required" });
  });

  it("rejects unknown access tokens", async () => {
    const response = await client.api.integrations.sanity.session.$get(undefined, {
      headers: {
        "X-Hyperlocalise-Access-Token": "hl_sanity_at_unknown_token_value",
      },
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "sanity_access_token_invalid" });
  });

  it("returns the workspace session and lists accessible projects", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity session key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity session",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    const response = await client.api.integrations.sanity.session.$get(undefined, {
      headers: integrationHeaders,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: { projects: Array<{ id: string }>; connection: { id: string } };
    };
    expect(body.session.projects.map((project) => project.id)).toContain(projectBody.project.id);
    expect(body.session.connection.id).toBe(created.connection.id);
  });

  it("rejects session when the backing API key was revoked", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity revoked key",
    });
    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity revoked",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    await db
      .update(schema.organizationApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.organizationApiKeys.id, apiKey.id));

    const response = await client.api.integrations.sanity.session.$get(undefined, {
      headers: integrationHeaders,
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: "sanity_api_key_not_found" });
  });

  it("rejects session when the backing API key is missing required permissions", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity scoped key",
    });
    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity scoped",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    await db
      .update(schema.organizationApiKeys)
      .set({ permissions: ["files:read", "jobs:read"] })
      .where(eq(schema.organizationApiKeys.id, apiKey.id));

    const response = await client.api.integrations.sanity.session.$get(undefined, {
      headers: integrationHeaders,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "sanity_api_key_missing_permissions",
    });
  });

  it("lists org projects on session without binding a connection to one", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity unbound key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as {
      project: { id: string; name: string };
    };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity unbound",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    const response = await client.api.integrations.sanity.session.$get(undefined, {
      headers: integrationHeaders,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: {
        projects: Array<{ id: string; name: string }>;
      };
    };
    expect(body.session.projects.map((project) => project.id)).toContain(projectBody.project.id);
  });

  it("collects a page file without creating a job", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity collect key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity collect",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.collectSanityPageMock.mockResolvedValue({
      projectId: projectBody.project.id,
      sourceFileId: "file_collected",
      sourcePath: SOURCE_PATH,
      segmentCount: 3,
    });

    const response = await client.api.integrations.sanity.collect.$post(
      {
        json: {
          projectId: projectBody.project.id,
          ...sanityDocumentFields(),
          segments: [sampleSegment],
        },
      },
      {
        headers: integrationHeaders,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      projectId: projectBody.project.id,
      sourceFileId: "file_collected",
      sourcePath: SOURCE_PATH,
      segmentCount: 3,
    });
    expect(mocks.collectSanityPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: apiKey.id,
        ...sanityDocumentFields(),
      }),
    );
    expect(mocks.startSanityLocalizationMock).not.toHaveBeenCalled();
  });

  it("imports target locale translations for a collected document", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity import key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity import",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.importSanityPluginTargetTranslationsMock.mockResolvedValue({
      matched: 1,
      imported: 1,
      skipped: 0,
    });

    const response = await createApp().request(
      "http://localhost/api/integrations/sanity/translations/import",
      {
        method: "POST",
        headers: {
          ...integrationHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: projectBody.project.id,
          ...sanityDocumentFields(),
          targetLocale: "fr-FR",
          entries: { [sampleSegment.key]: "Bonjour" },
        }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      matched: 1,
      imported: 1,
      skipped: 0,
    });
    expect(mocks.importSanityPluginTargetTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: projectBody.project.id,
        sanityProjectId: SANITY_PROJECT_ID,
        dataset: SANITY_DATASET,
        documentId: DOCUMENT_ID,
        targetLocale: "fr-FR",
      }),
    );
  });

  it("lists locale status from collected pages and jobs", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity locales key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity locales",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.listSanityPageLocaleStatusesMock.mockResolvedValue({
      locales: [
        {
          locale: "en",
          isSource: true,
          documents: [{ documentId: DOCUMENT_ID, status: "succeeded" }],
        },
      ],
      documents: [
        {
          documentId: DOCUMENT_ID,
          sourcePath: SOURCE_PATH,
          sourceFileId: "file_collected",
          segmentCount: 3,
        },
      ],
    });

    const response = await client.api.integrations.sanity.locales.$get(
      {
        query: {
          sanityProjectId: SANITY_PROJECT_ID,
          dataset: SANITY_DATASET,
          documentIds: DOCUMENT_ID,
          projectId: projectBody.project.id,
        },
      },
      {
        headers: integrationHeaders,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      locales: expect.any(Array),
      documents: expect.any(Array),
    });
    expect(mocks.listSanityPageLocaleStatusesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sanityProjectId: SANITY_PROJECT_ID,
        dataset: SANITY_DATASET,
        documentIds: [DOCUMENT_ID],
      }),
    );
  });

  it("creates a job when the access token is valid and projectId is supplied", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity jobs key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity jobs",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.getAccessibleSanityProjectMock.mockResolvedValue({
      id: projectBody.project.id,
      name: "Test project",
      source: "native",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
    });

    mocks.startSanityLocalizationMock.mockResolvedValue({
      jobId: "job_created",
      generated: false,
      projectId: projectBody.project.id,
      sourcePath: SOURCE_PATH,
    });

    const response = await client.api.integrations.sanity.jobs.$post(
      {
        json: {
          projectId: projectBody.project.id,
          documents: [{ ...sanityDocumentFields(), segments: [sampleSegment] }],
          targetLocales: ["fr-FR"],
          generate: false,
        },
      },
      {
        headers: integrationHeaders,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: {
        jobId: "job_created",
        generated: false,
        projectId: projectBody.project.id,
        sourcePath: SOURCE_PATH,
      },
    });
    expect(mocks.startSanityLocalizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generate: false,
        projectId: projectBody.project.id,
        ...sanityDocumentFields(),
      }),
    );
  });

  it("generates a new-locale job from the collected page when segments are omitted", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity generate key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity generate",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.getAccessibleSanityProjectMock.mockResolvedValue({
      id: projectBody.project.id,
      name: "Test project",
      source: "native",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
    });

    mocks.generateSanityLocaleJobsMock.mockResolvedValue({
      jobId: "job_generated",
      generated: true,
      projectId: projectBody.project.id,
      sourcePath: SOURCE_PATH,
    });

    const response = await client.api.integrations.sanity.jobs.$post(
      {
        json: {
          projectId: projectBody.project.id,
          documents: [sanityDocumentFields()],
          targetLocales: ["vi"],
          generate: true,
        },
      },
      {
        headers: integrationHeaders,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: {
        jobId: "job_generated",
        generated: true,
        projectId: projectBody.project.id,
        sourcePath: SOURCE_PATH,
      },
    });
    expect(mocks.startSanityLocalizationMock).not.toHaveBeenCalled();
    expect(mocks.generateSanityLocaleJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: projectBody.project.id,
        ...sanityDocumentFields(),
        targetLocales: ["vi"],
      }),
    );
  });

  it("rejects job creation without projectId", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity unbound jobs key",
    });

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity unbound jobs",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    const response = await client.api.integrations.sanity.jobs.$post(
      {
        json: {
          documents: [{ ...sanityDocumentFields(), segments: [sampleSegment] }],
          generate: true,
        } as never,
      },
      {
        headers: integrationHeaders,
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_sanity_job_payload" });
  });

  it("pulls translations for a project", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity pull key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity pull",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.pullSanityPageLocaleContentMock.mockResolvedValue({
      kind: "job",
      translations: {
        jobId: "job_pull",
        status: "completed",
        translationsByLocale: { "fr-FR": { [sampleSegment.key]: "Bonjour" } },
      },
    });

    const response = await client.api.integrations.sanity.translations.$get(
      {
        query: {
          projectId: projectBody.project.id,
          ...sanityDocumentFields(),
        },
      },
      {
        headers: integrationHeaders,
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
      name: "Sanity source pull key",
    });
    const projectResponse = await projectFixture.createProjectViaApi(identity);
    const projectBody = (await projectResponse.json()) as { project: { id: string } };

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity source pull",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    mocks.pullSanityPageLocaleContentMock.mockResolvedValue({
      kind: "source",
      sourcePage: {
        locale: "en-US",
        sourcePath: SOURCE_PATH,
        needsReupload: false,
        entries: [{ key: sampleSegment.key, source: "Hello", knownTexts: ["Hola"] }],
      },
    });

    const response = await client.api.integrations.sanity.translations.$get(
      {
        query: {
          projectId: projectBody.project.id,
          ...sanityDocumentFields(),
          locale: "en-US",
        },
      },
      {
        headers: integrationHeaders,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sourcePage: {
        locale: "en-US",
        sourcePath: SOURCE_PATH,
        needsReupload: false,
        entries: [{ key: sampleSegment.key, source: "Hello", knownTexts: ["Hola"] }],
      },
    });
  });

  it("updates lastUsedAt on the Sanity connection after a successful request", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity usage key",
    });
    await projectFixture.createProjectViaApi(identity);

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity usage",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    const [untouched] = await db
      .select({ lastUsedAt: schema.sanityConnections.lastUsedAt })
      .from(schema.sanityConnections)
      .where(eq(schema.sanityConnections.id, created.connection.id));
    expect(untouched?.lastUsedAt).toBeNull();

    await client.api.integrations.sanity.session.$get(undefined, {
      headers: integrationHeaders,
    });

    const [touched] = await db
      .select({ lastUsedAt: schema.sanityConnections.lastUsedAt })
      .from(schema.sanityConnections)
      .where(eq(schema.sanityConnections.id, created.connection.id));
    expect(touched?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects disabled connections", async () => {
    const identity = apiKeyFixture.createWorkosIdentityWithRole("admin");
    const headers = await apiKeyFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const organizationId = auth.organization.localOrganizationId;
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const { apiKey } = await apiKeyFixture.createOwnedApiKey(identity, {
      name: "Sanity disabled key",
    });
    await projectFixture.createProjectViaApi(identity);

    const created = await createSanityConnection({
      organizationId,
      userId: auth.user.localUserId,
      displayName: "Sanity disabled",
      apiKeyId: apiKey.id,
    });

    const integrationHeaders = await accessTokenHeaders({
      connectionId: created.connection.id,
      userId: auth.user.localUserId,
      organizationId,
    });

    const disableResponse = await client.api.orgs[":organizationSlug"]["sanity-connections"][
      ":connectionId"
    ].$patch(
      {
        param: { organizationSlug, connectionId: created.connection.id },
        json: { enabled: false },
      },
      { headers },
    );
    expect(disableResponse.status).toBe(200);

    const response = await client.api.integrations.sanity.session.$get(undefined, {
      headers: integrationHeaders,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "sanity_connection_disabled" });
  });
});
