import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import * as policy from "@/api/auth/policy";
import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import {
  getActiveOrganizationExternalTmsProviderCredential,
  upsertCrowdinOAuthProviderCredential,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import * as tmsProviderLive from "@/lib/providers/tms-provider-live";
import type { TmsProviderLiveFileDetail } from "@/lib/providers/tms-provider-live";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { createProviderCredentialTestFixture } from "../provider-credential/provider-credential.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
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
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("workflow/api", () => ({
  start: vi.fn(async () => ({ runId: "wrun_provider_sync_test" })),
}));

const client = testClient(app);
const fixture = createProviderCredentialTestFixture(client);

describe("tmsProviderRoutes", () => {
  beforeAll(async () => {
    await import("@/lib/database").then(({ db }) => db.$client.query("select 1"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("returns 404 when no active TMS provider is connected", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].connection.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(404);
  });

  it("returns live projects for the active provider", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId: globalThis.__testApiAuthContext!.user.localUserId,
      role: "admin",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
      region: "us",
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId: globalThis.__testApiAuthContext!.user.localUserId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const active = await getActiveOrganizationExternalTmsProviderCredential(organizationId);
    expect(active?.providerKind).toBe("crowdin");

    const listProjects = vi
      .spyOn(tmsProviderLive, "listTmsProviderLiveProjects")
      .mockResolvedValue([
        {
          id: "ext:crowdin:42",
          name: "Marketing",
          description: null,
          translationContext: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "external_tms",
          externalProviderKind: "crowdin",
          externalProjectId: "42",
          sourceLocale: "en",
          targetLocales: ["fr"],
          externalProjectUrl: "https://crowdin.com/project/42",
          isActive: true,
          openJobCount: 0,
        },
      ]);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: unknown[] };
    expect(body.projects).toHaveLength(1);
    expect(listProjects).toHaveBeenCalledWith(organizationId, {
      actorUserId: expect.any(String),
    });
  });

  it("returns 401 when Crowdin OAuth refresh fails while loading live projects", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertCrowdinOAuthProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: "admin",
      displayName: "Crowdin",
      tokenBundle: {
        clientId: "client-id",
        clientSecret: "client-secret",
        accessToken: "expired-token",
        refreshToken: "refresh-token",
        tokenType: "bearer",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 })),
    );

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_user_connection_required",
      message: "Connect your Crowdin account before using Crowdin.",
    });
  });

  it("returns live files for a provider project", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const listFiles = vi
      .spyOn(tmsProviderLive, "listTmsProviderLiveFilesForProject")
      .mockResolvedValue([
        {
          origin: "provider",
          sourcePath: "keys/home.title",
          sourceHash: null,
          commitSha: null,
          workflowRunId: null,
          uploadedAt: new Date().toISOString(),
          storedFileId: null,
          metadata: {},
          filename: "home.title",
          byteSize: null,
          provider: {
            kind: "crowdin",
            resourceType: "key",
            externalProjectId: "902807",
            externalResourceId: "key-1",
            externalUrl: null,
            syncState: "synced",
            sourceLocale: "en",
            targetLocales: ["fr"],
            localeReadiness: {},
            revision: null,
            format: "icu",
            lastSyncedAt: new Date().toISOString(),
          },
          latestJob: null,
        },
      ]);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].projects[
      ":externalProjectId"
    ].files.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          externalProjectId: "902807",
        },
        query: { limit: "500" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { files: unknown[] };
    expect(body.files).toHaveLength(1);
    expect(listFiles).toHaveBeenCalledWith(organizationId, "902807", {
      limit: 500,
      actorUserId: expect.any(String),
    });
  });

  it("returns live job comments for a provider task", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const listComments = vi
      .spyOn(tmsProviderLive, "listTmsProviderLiveJobComments")
      .mockResolvedValue([
        {
          id: "crowdin:task-comment:17",
          externalCommentId: "17",
          userId: "42",
          taskId: "99",
          text: "Please prioritize this task.",
          timeSpentSeconds: null,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
      ]);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ].comments.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      comments: [
        {
          id: "crowdin:task-comment:17",
          externalCommentId: "17",
          userId: "42",
          taskId: "99",
          text: "Please prioritize this task.",
          timeSpentSeconds: null,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
      ],
    });
    expect(listComments).toHaveBeenCalledWith(organizationId, "ext:crowdin:902807:99", {
      actorUserId: expect.any(String),
    });
  });

  it("returns live job file detail for a provider task", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const fileDetail: TmsProviderLiveFileDetail = {
      sourcePath: "locales/en.json",
      filename: "en.json",
      provider: {
        kind: "crowdin" as const,
        resourceType: "file" as const,
        externalProjectId: "902807",
        externalResourceId: "12",
        externalUrl: "https://crowdin.com/file/12",
        syncState: "synced" as const,
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: "2026-06-01T10:00:00.000Z",
      },
      versions: [
        {
          id: "provider-live:crowdin:902807:12",
          origin: "provider" as const,
          sourcePath: "locales/en.json",
          sourceHash: null,
          revision: "1",
          commitSha: null,
          workflowRunId: null,
          uploadedAt: "2026-06-01T10:00:00.000Z",
          storedFileId: null,
          filename: "en.json",
          contentType: "application/json",
          byteSize: 18,
          sha256: null,
          metadata: {},
          content: { text: '{"hello":"world"}' },
        },
      ],
      jobsByLocale: [],
      providerJobsByLocale: [],
    };

    const getJobFileDetail = vi
      .spyOn(tmsProviderLive, "getTmsProviderLiveJobFileDetail")
      .mockResolvedValue(fileDetail);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ].files.detail.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
        query: { sourcePath: "locales/en.json" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ file: fileDetail });
    expect(getJobFileDetail).toHaveBeenCalledWith(
      organizationId,
      "ext:crowdin:902807:99",
      "locales/en.json",
      { actorUserId: expect.any(String) },
    );
  });

  it("returns 404 when live job file detail is not found", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    vi.spyOn(tmsProviderLive, "getTmsProviderLiveJobFileDetail").mockResolvedValue(null);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ].files.detail.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
        query: { sourcePath: "locales/missing.json" },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file_not_found" });
  });

  it("returns 403 when reading live job file detail without jobs:read", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const originalHasCapability = policy.hasCapability;
    const hasCapabilitySpy = vi
      .spyOn(policy, "hasCapability")
      .mockImplementation((role, capability) => {
        if (capability === "jobs:read") {
          return false;
        }

        return originalHasCapability(role, capability);
      });

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ].files.detail.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
        query: { sourcePath: "locales/en.json" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    hasCapabilitySpy.mockRestore();
  });

  it("returns 400 when live job file detail query is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ].files.detail.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
        query: { sourcePath: "" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_query" });
  });

  it("returns live job files for a provider task", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const listJobFiles = vi
      .spyOn(tmsProviderLive, "listTmsProviderLiveJobFiles")
      .mockResolvedValue([
        {
          origin: "provider",
          sourcePath: "locales/en.json",
          sourceHash: null,
          commitSha: null,
          workflowRunId: null,
          uploadedAt: "2026-06-01T10:00:00.000Z",
          storedFileId: null,
          metadata: {},
          filename: "en.json",
          byteSize: null,
          provider: {
            kind: "crowdin",
            resourceType: "file",
            externalProjectId: "902807",
            externalResourceId: "12",
            externalUrl: "https://crowdin.com/file/12",
            syncState: "synced",
            sourceLocale: "en",
            targetLocales: ["fr"],
            localeReadiness: {},
            revision: "1",
            format: "json",
            lastSyncedAt: "2026-06-01T10:00:00.000Z",
          },
          latestJob: null,
        },
      ]);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ].files.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { files: unknown[] };
    expect(body.files).toHaveLength(1);
    expect(listJobFiles).toHaveBeenCalledWith(organizationId, "ext:crowdin:902807:99", {
      actorUserId: expect.any(String),
    });
  });

  it("accepts URL-encoded project ids when starting translate_with_agent", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const projectId = "ext:crowdin:902807";
    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      teamId: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "Crowdin project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: credential.id,
      externalProjectId: "902807",
      sourceLocale: "en",
      targetLocales: ["fr"],
      isActive: true,
    });

    vi.spyOn(tmsProviderLive, "getTmsProviderLiveJobDetail").mockResolvedValue({
      id: "ext:crowdin:902807:99",
      projectId,
      projectName: "Crowdin project",
      createdByUserId: null,
      kind: "translation",
      type: null,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      workflowRunId: null,
      lastError: null,
      inputPayload: null,
      outcomeKind: null,
      outcomePayload: null,
      reviewCriteria: null,
      reviewTargetLocale: null,
      syncConnectorKind: null,
      syncDirection: null,
      assetType: null,
      assetOperation: null,
      externalProviderKind: "crowdin",
      externalTaskId: "99",
      externalStatus: "in_progress",
      externalTitle: "Translate homepage",
      externalDueDate: null,
      externalTargetLocales: ["fr"],
      externalAssignedUsers: [],
      externalSyncState: null,
      externalJobId: "99",
      externalUrl: "https://crowdin.com/task/99",
      externalProviderPayload: { type: 0 },
    });

    vi.spyOn(tmsProviderLive, "listTmsProviderLiveJobFiles").mockResolvedValue([
      {
        origin: "provider",
        sourcePath: "locales/en.json",
        sourceHash: null,
        commitSha: null,
        workflowRunId: null,
        uploadedAt: new Date().toISOString(),
        storedFileId: null,
        metadata: {},
        filename: "en.json",
        byteSize: null,
        provider: {
          kind: "crowdin",
          resourceType: "file",
          externalProjectId: "902807",
          externalResourceId: "12",
          externalUrl: "https://crowdin.com/file/12",
          syncState: "synced",
          sourceLocale: "en",
          targetLocales: ["fr"],
          localeReadiness: {},
          revision: "1",
          format: "json",
          lastSyncedAt: new Date().toISOString(),
        },
        latestJob: null,
      },
    ]);

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].jobs[
      ":encodedJobId"
    ]["agent-runs"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          encodedJobId: "ext:crowdin:902807:99",
        },
        json: {
          projectId: "ext%3Acrowdin%3A902807",
          action: "translate_with_agent",
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      agentRun: {
        kind: "translate",
        status: "queued",
      },
    });
  });

  it("returns 401 when the stored Crowdin OAuth token bundle is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const credential = await upsertCrowdinOAuthProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: "admin",
      displayName: "Crowdin",
      tokenBundle: {
        clientId: "client-id",
        clientSecret: "client-secret",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "bearer",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential("not-json"));
    await db
      .update(schema.organizationExternalTmsProviderCredentials)
      .set({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptionAlgorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
      })
      .where(eq(schema.organizationExternalTmsProviderCredentials.id, credential.id));

    const response = await client.api.orgs[":organizationSlug"]["tms-provider"].projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "crowdin_user_connection_required",
      message: "Connect your Crowdin account before using Crowdin.",
    });
  });
});
