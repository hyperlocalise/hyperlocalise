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

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { eq } from "drizzle-orm";

import { app } from "@/api/app";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { ensureImageVariantsForSourceFile } from "@/lib/projects/files/image-variant-service";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live";

import { createProjectTestFixture } from "./project.fixture";
import { ok } from "@/lib/primitives/result/results";
import type {
  ProjectFileCatConcordanceResponse,
  ProjectFileCatCommentResponse,
  ProjectFileCatQueueResponse,
  ProjectFileCatRecommendationResponse,
  ProjectFileCatResponse,
  ProjectFileCatSegmentCommentsResponse,
  ProjectFileCatSegmentTargetResponse,
  ProjectFileCatTranslationResponse,
} from "./project.schema";

const {
  getTmsProviderConnectionMock,
  getTmsProviderLiveCatFileMock,
  getTmsProviderLiveCatAllFilesMock,
  saveTmsProviderLiveCatTranslationMock,
  setTmsProviderLiveCatStringsHiddenMock,
  saveTmsProviderLiveCatCommentMock,
  resolveTmsProviderLiveCatCommentMock,
  loadCatSegmentConcordanceMock,
  loadCatSegmentVisualContextMock,
  generateCatAiRecommendationMock,
  ensureOrganizationProjectRecordMock,
  createStoredFileMock,
  deleteStoredFileMock,
  isReleaseCatAllFilesEnabledMock,
} = vi.hoisted(() => ({
  getTmsProviderConnectionMock: vi.fn(),
  getTmsProviderLiveCatFileMock: vi.fn(),
  getTmsProviderLiveCatAllFilesMock: vi.fn(),
  saveTmsProviderLiveCatTranslationMock: vi.fn(),
  setTmsProviderLiveCatStringsHiddenMock: vi.fn(),
  saveTmsProviderLiveCatCommentMock: vi.fn(),
  resolveTmsProviderLiveCatCommentMock: vi.fn(),
  loadCatSegmentConcordanceMock: vi.fn(),
  loadCatSegmentVisualContextMock: vi.fn(),
  generateCatAiRecommendationMock: vi.fn(),
  ensureOrganizationProjectRecordMock: vi.fn(),
  createStoredFileMock: vi.fn(),
  deleteStoredFileMock: vi.fn(),
  isReleaseCatAllFilesEnabledMock: vi.fn(async () => false),
}));

vi.mock("@/lib/flags/release-flags", () => ({
  isReleaseCatAllFilesEnabled: isReleaseCatAllFilesEnabledMock,
  RELEASE_CAT_ALL_FILES_FLAG: "release-cat-all-files",
}));

vi.mock("@/lib/translation/cat", () => ({
  loadCatSegmentConcordance: (...args: unknown[]) => loadCatSegmentConcordanceMock(...args),
  loadCatSegmentVisualContext: (...args: unknown[]) => loadCatSegmentVisualContextMock(...args),
  generateCatAiRecommendation: (...args: unknown[]) => generateCatAiRecommendationMock(...args),
}));

vi.mock("@/lib/projects/organization/organization-project-service", () => ({
  ensureOrganizationProjectRecord: (...args: unknown[]) =>
    ensureOrganizationProjectRecordMock(...args),
}));

vi.mock("@/lib/file-storage/records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-storage/records")>();
  return {
    ...actual,
    createStoredFile: (...args: unknown[]) => createStoredFileMock(...args),
    deleteStoredFile: (...args: unknown[]) => deleteStoredFileMock(...args),
  };
});

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderConnection: (...args: unknown[]) => getTmsProviderConnectionMock(...args),
    getTmsProviderLiveCatFile: (...args: unknown[]) => getTmsProviderLiveCatFileMock(...args),
    getTmsProviderLiveCatAllFiles: (...args: unknown[]) =>
      getTmsProviderLiveCatAllFilesMock(...args),
    saveTmsProviderLiveCatTranslation: (...args: unknown[]) =>
      saveTmsProviderLiveCatTranslationMock(...args),
    setTmsProviderLiveCatStringsHidden: (...args: unknown[]) =>
      setTmsProviderLiveCatStringsHiddenMock(...args),
    saveTmsProviderLiveCatComment: (...args: unknown[]) =>
      saveTmsProviderLiveCatCommentMock(...args),
    resolveTmsProviderLiveCatComment: (...args: unknown[]) =>
      resolveTmsProviderLiveCatCommentMock(...args),
  };
});

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

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  isReleaseCatAllFilesEnabledMock.mockResolvedValue(false);
  await projectFixture.cleanup();
});

describe("project file CAT routes", () => {
  it("rejects All Files CAT when the release flag is off", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    isReleaseCatAllFilesEnabledMock.mockResolvedValue(false);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: {
          sourcePath: "*",
          targetLocale: "fr",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "feature_unavailable" });
    expect(getTmsProviderLiveCatAllFilesMock).not.toHaveBeenCalled();
  });

  it("loads Crowdin All Files CAT when the release flag is on", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    isReleaseCatAllFilesEnabledMock.mockResolvedValue(true);
    getTmsProviderLiveCatAllFilesMock.mockResolvedValue({
      sourcePath: "*",
      filename: "All Files",
      provider: {
        kind: "crowdin",
        resourceType: "file",
        externalProjectId: "42",
        externalResourceId: "101",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: null,
      },
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
      pagination: {
        offset: 0,
        limit: 50,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
      },
      segments: [
        {
          externalStringId: "1001",
          key: "hello",
          sourceText: "Hello",
          context: null,
          type: "text",
          sourcePath: "crowdin/home.json",
          externalResourceId: "101",
          resourceType: "file",
        },
      ],
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: {
          sourcePath: "*",
          targetLocale: "fr",
          limit: 50,
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      catQueue: {
        sourcePath: "*",
        segments: [{ externalStringId: "1001", sourcePath: "crowdin/home.json" }],
      },
    });
    expect(getTmsProviderLiveCatAllFilesMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "fr",
      expect.objectContaining({
        pagination: expect.objectContaining({ paginated: true, limit: 50 }),
      }),
    );
    expect(isReleaseCatAllFilesEnabledMock).toHaveBeenCalledWith("crowdin");
  });

  it("rejects All Files CAT when decide disables the provider", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "phrase",
      displayName: "Phrase",
      validationStatus: "valid",
      validationMessage: null,
    });
    isReleaseCatAllFilesEnabledMock.mockResolvedValue(false);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:phrase:42",
        },
        query: {
          sourcePath: "*",
          targetLocale: "fr",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "feature_unavailable" });
    expect(isReleaseCatAllFilesEnabledMock).toHaveBeenCalledWith("phrase");
    expect(getTmsProviderLiveCatAllFilesMock).not.toHaveBeenCalled();
  });

  it("rejects All Files CAT at the TMS layer when Flags Explorer overrides the flag on for an unsupported provider", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "phrase",
      displayName: "Phrase",
      validationStatus: "valid",
      validationMessage: null,
    });
    isReleaseCatAllFilesEnabledMock.mockResolvedValue(true);
    getTmsProviderLiveCatAllFilesMock.mockRejectedValue(
      new TmsProviderLiveError(
        "provider_cat_all_files_unsupported",
        "All Files CAT is not available for this provider yet.",
      ),
    );

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:phrase:42",
        },
        query: {
          sourcePath: "*",
          targetLocale: "fr",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      error: "provider_cat_all_files_unsupported",
    });
    expect(isReleaseCatAllFilesEnabledMock).toHaveBeenCalledWith("phrase");
    expect(getTmsProviderLiveCatAllFilesMock).toHaveBeenCalled();
  });

  it("returns a select-a-file message when Crowdin All Files CROQL is too large", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    isReleaseCatAllFilesEnabledMock.mockResolvedValue(true);
    getTmsProviderLiveCatAllFilesMock.mockRejectedValue(
      new TmsProviderLiveError(
        "crowdin_cat_all_files_query_too_large",
        "This Crowdin project has too many files to open All Files at once. Select a single file to view strings instead.",
      ),
    );

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: {
          sourcePath: "*",
          targetLocale: "fr",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "crowdin_cat_all_files_query_too_large",
      message:
        "This Crowdin project has too many files to open All Files at once. Select a single file to view strings instead.",
    });
  });

  it("returns Crowdin AI recommendations for an encoded provider project", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    ensureOrganizationProjectRecordMock.mockResolvedValue(ok("ext:crowdin:42"));
    generateCatAiRecommendationMock.mockResolvedValue(
      ok({
        aiSuggestion: "Bonjour",
        aiReasoning: "Natural French greeting.",
      }),
    );
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.recommendation.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          sourceLocale: "en",
          targetLocale: "fr",
          displayLocale: "de-DE",
          key: "hello",
          sourceText: "Hello",
          targetText: "Bonjour",
          glossaryTerms: [],
          translationMemoryMatches: [],
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatRecommendationResponse;
    expect(body.recommendation).toMatchObject({
      aiSuggestion: "Bonjour",
      aiReasoning: "Natural French greeting.",
    });
    expect(trackSpy).toHaveBeenCalledWith(
      PRODUCT_USAGE_ANALYTICS_EVENTS.catAiRecommendationRequested,
      { source: "external_tms" },
    );
    trackSpy.mockRestore();
    expect(ensureOrganizationProjectRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "ext:crowdin:42",
      }),
    );
    expect(generateCatAiRecommendationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "ext:crowdin:42",
        sourcePath: "crowdin/home.json",
        key: "hello",
        sourceText: "Hello",
        displayLocale: "de-DE",
      }),
    );
  });

  it("returns Crowdin concordance matches for a CAT segment", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    loadCatSegmentConcordanceMock.mockResolvedValue({
      glossaryTerms: [
        {
          id: "glossary-1",
          source: "workspace",
          target: "espace de travail",
          approved: true,
          forbidden: false,
        },
      ],
      translationMemoryMatches: [
        {
          id: "tm-1",
          sourceText: "Hello",
          targetText: "Bonjour",
          matchPercent: 100,
          contextLabel: "Website TM",
        },
      ],
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.concordance.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourceLocale: "en",
          targetLocale: "fr",
          sourceText: "Hello workspace",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatConcordanceResponse;
    expect(body.concordance.glossaryTerms).toHaveLength(1);
    expect(body.concordance.translationMemoryMatches).toHaveLength(1);
    expect(loadCatSegmentConcordanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "ext:crowdin:42",
        providerKind: "crowdin",
        actorUserId: expect.any(String),
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello workspace",
      }),
    );
  });

  it("loads provider visual context for TMS segments", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    loadCatSegmentVisualContextMock.mockResolvedValue({
      screenshots: [
        {
          id: "12",
          name: "Checkout",
          imageUrl: "https://example.com/screen.jpg",
          width: 200,
          height: 400,
          markers: [{ left: 10, top: 10, width: 25, height: 5 }],
        },
      ],
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat["visual-context"].$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "home.json",
          externalStringId: "99",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      visualContext: {
        screenshots: [
          expect.objectContaining({
            id: "12",
            imageUrl: "https://example.com/screen.jpg",
          }),
        ],
      },
    });
    expect(loadCatSegmentVisualContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKind: "crowdin",
        externalProjectId: "42",
        externalStringId: "99",
        sourcePath: "home.json",
      }),
    );
  });

  it("rejects visual context for native projects", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat["visual-context"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath: "home.json",
          externalStringId: "segment-1",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "visual_context_unavailable" });
  });

  it("returns native CAT comment counts on list and comments on segment detail", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    const { imported } = await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });
    expect(imported).toBe(1);

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    expect(translationKey).toBeDefined();

    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});
    const postResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          text: "Please clarify tone.",
        },
      },
      { headers },
    );

    expect(postResponse.status).toBe(200);
    expect(saveTmsProviderLiveCatCommentMock).not.toHaveBeenCalled();
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catCommentCreated, {
      source: "native",
      feature: "comment",
    });
    trackSpy.mockRestore();

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatResponse;
    expect(body.catFile.segments[0]).not.toHaveProperty("comments");

    const targetResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].target.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(targetResponse.status).toBe(200);
    const targetBody = (await targetResponse.json()) as ProjectFileCatSegmentTargetResponse;
    expect(targetBody.target).toBeNull();

    const commentsResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].comments.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(commentsResponse.status).toBe(200);
    const commentsBody = (await commentsResponse.json()) as ProjectFileCatSegmentCommentsResponse;
    expect(commentsBody.comments).toMatchObject([
      {
        type: "comment",
        text: "Please clarify tone.",
        author: expect.any(String),
      },
    ]);
    expect(commentsBody.comments[0]?.externalCommentId).toBeTruthy();
  });

  it("emits product usage analytics for native CAT draft, approve, and status updates", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    const { imported } = await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });
    expect(imported).toBe(1);

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    expect(translationKey).toBeDefined();

    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});
    const draftResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          text: "Bonjour",
          approve: false,
        },
      },
      { headers },
    );
    expect(draftResponse.status).toBe(200);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catSegmentDraftSaved, {
      source: "native",
      status: "draft",
    });

    const approveResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          text: "Bonjour",
          approve: true,
        },
      },
      { headers },
    );
    expect(approveResponse.status).toBe(200);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catSegmentApproved, {
      source: "native",
      status: "approved",
    });

    trackSpy.mockClear();
    const statusResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.status.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          status: "approved",
        },
      },
      { headers },
    );
    expect(statusResponse.status).toBe(200);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catSegmentApproved, {
      source: "native",
      status: "approved",
    });
    trackSpy.mockRestore();
  });

  it("loads native segment targets with All Files sourcePath=*", async () => {
    isReleaseCatAllFilesEnabledMock.mockResolvedValue(true);
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    const { imported } = await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });
    expect(imported).toBe(1);

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    expect(translationKey).toBeDefined();

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: translationKey!.id,
      targetLocale: "fr-FR",
      text: "Bonjour",
      status: "needs_review",
      provenance: "manual",
    });

    const missingFileResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].target.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        query: { sourcePath: "missing/file.json", targetLocale: "fr-FR" },
      },
      { headers },
    );
    expect(missingFileResponse.status).toBe(404);

    const allFilesTargetResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].target.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        query: { sourcePath: "*", targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(allFilesTargetResponse.status).toBe(200);
    const allFilesTargetBody =
      (await allFilesTargetResponse.json()) as ProjectFileCatSegmentTargetResponse;
    expect(allFilesTargetBody.target).toMatchObject({
      text: "Bonjour",
      isApproved: false,
      status: "needs_review",
    });

    const allFilesCommentsResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].comments.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        query: { sourcePath: "*", targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(allFilesCommentsResponse.status).toBe(200);
    expect(await allFilesCommentsResponse.json()).toMatchObject({ comments: [] });
  });

  it("toggles treat-as-image metadata on a native CAT segment", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [
        {
          key: "banner.url",
          text: "https://cdn.example.com/banner.png",
          context: null,
        },
      ],
    });

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    expect(translationKey).toBeDefined();

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"]["treat-as-image"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          treatAsImage: true,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      segment: {
        externalStringId: string;
        contentKind: string;
        looksLikeImageUrl: boolean;
      };
    };
    expect(body.segment).toMatchObject({
      externalStringId: translationKey!.id,
      contentKind: "image_url",
      looksLikeImageUrl: true,
    });

    const catResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );
    expect(catResponse.status).toBe(200);
    const catBody = (await catResponse.json()) as ProjectFileCatResponse;
    expect(catBody.catFile.segments[0]).toMatchObject({
      contentKind: "image_url",
      looksLikeImageUrl: true,
    });
  });

  it("toggles treat-as-video metadata on a native CAT segment", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [
        {
          key: "banner.video",
          text: "https://cdn.example.com/banner.mp4",
          context: null,
        },
      ],
    });

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    expect(translationKey).toBeDefined();

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"]["treat-as-video"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKey!.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          treatAsVideo: true,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      segment: {
        externalStringId: string;
        contentKind: string;
        looksLikeVideoUrl: boolean;
      };
    };
    expect(body.segment).toMatchObject({
      externalStringId: translationKey!.id,
      contentKind: "video_url",
      looksLikeVideoUrl: true,
    });

    const catResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );
    expect(catResponse.status).toBe(200);
    const catBody = (await catResponse.json()) as ProjectFileCatResponse;
    expect(catBody.catFile.segments[0]).toMatchObject({
      contentKind: "video_url",
      looksLikeVideoUrl: true,
    });
  });

  it("rejects treat-as-video for provider CAT", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"]["treat-as-video"].$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
          externalStringId: "string_1",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "string_1",
          treatAsVideo: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "provider_cat_unsupported" });
  });

  it("toggles treat-as-image for external TMS segments and enriches the CAT queue", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockResolvedValue({
      sourcePath: "crowdin/home.json",
      filename: "home.json",
      provider: {
        kind: "crowdin",
        resourceType: "file",
        externalProjectId: "42",
        externalResourceId: "101",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: null,
      },
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
      pagination: {
        offset: 0,
        limit: 50,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
      },
      segments: [
        {
          externalStringId: "1001",
          key: "banner.url",
          sourceText: "https://cdn.example.com/banner.png",
          context: null,
          type: null,
        },
      ],
      targetsByExternalStringId: {},
    });

    const treatResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"]["treat-as-image"].$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
          externalStringId: "1001",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          externalResourceId: "101",
          treatAsImage: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(treatResponse.status).toBe(200);
    expect(await treatResponse.json()).toMatchObject({
      segment: {
        externalStringId: "1001",
        contentKind: "image_url",
        looksLikeImageUrl: true,
      },
    });

    const catResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: { sourcePath: "crowdin/home.json", targetLocale: "fr" },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(catResponse.status).toBe(200);
    const catBody = (await catResponse.json()) as ProjectFileCatResponse;
    expect(catBody.catFile.segments[0]).toMatchObject({
      externalStringId: "1001",
      contentKind: "image_url",
      sourceAssetUrl: "https://cdn.example.com/banner.png",
      looksLikeImageUrl: true,
    });
  });

  it("uploads a translated image for external TMS and writes back a public media URL", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    ensureOrganizationProjectRecordMock.mockResolvedValue(ok("ext:crowdin:42"));
    createStoredFileMock.mockResolvedValue({
      id: "file_external-upload",
      organizationId: "org",
      projectId: "ext:crowdin:42",
      contentType: "image/png",
      filename: "banner-fr.png",
      metadata: { publicMedia: true },
    });
    saveTmsProviderLiveCatTranslationMock.mockImplementation(
      async (
        _organizationId: string,
        _externalProjectId: string,
        _sourcePath: string,
        input: { text: string },
      ) => ({
        text: input.text,
        externalTranslationId: "9001",
        isApproved: false,
      }),
    );

    const formData = new FormData();
    formData.set("sourcePath", "crowdin/home.json");
    formData.set("targetLocale", "fr");
    formData.set("externalStringId", "1001");
    formData.set("externalResourceId", "101");
    formData.set(
      "file",
      new File([Uint8Array.from([137, 80, 78, 71])], "banner-fr.png", { type: "image/png" }),
    );

    const response = await app.request(
      `/api/orgs/${encodeURIComponent(translator.organization.slug ?? "missing-slug")}/projects/${encodeURIComponent("ext:crowdin:42")}/files/detail/cat/images/upload`,
      {
        method: "POST",
        headers: await projectFixture.authHeadersFor(translator),
        body: formData,
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      translation: { text: string; contentKind: string; targetAssetUrl: string };
    };
    expect(body.translation.contentKind).toBe("image_url");
    expect(body.translation.targetAssetUrl).toMatch(/\/api\/public\/media\/file_external-upload$/);
    expect(body.translation.text).toBe(body.translation.targetAssetUrl);
    expect(createStoredFileMock).toHaveBeenCalled();
    expect(saveTmsProviderLiveCatTranslationMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      expect.objectContaining({
        targetLocale: "fr",
        externalStringId: "1001",
        externalResourceId: "101",
        text: body.translation.targetAssetUrl,
      }),
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
  });

  it("rejects provider image upload without externalResourceId", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });

    const formData = new FormData();
    formData.set("sourcePath", "crowdin/home.json");
    formData.set("targetLocale", "fr");
    formData.set("externalStringId", "1001");
    formData.set(
      "file",
      new File([Uint8Array.from([137, 80, 78, 71])], "banner-fr.png", { type: "image/png" }),
    );

    const response = await app.request(
      `/api/orgs/${encodeURIComponent(translator.organization.slug ?? "missing-slug")}/projects/${encodeURIComponent("ext:crowdin:42")}/files/detail/cat/images/upload`,
      {
        method: "POST",
        headers: await projectFixture.authHeadersFor(translator),
        body: formData,
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "external_resource_id_required" });
    expect(createStoredFileMock).not.toHaveBeenCalled();
    expect(saveTmsProviderLiveCatTranslationMock).not.toHaveBeenCalled();
  });

  it("deletes stored public media when provider write-back fails after upload", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    ensureOrganizationProjectRecordMock.mockResolvedValue(ok("ext:crowdin:42"));
    createStoredFileMock.mockResolvedValue({
      id: "file_external-upload-fail",
      organizationId: "org",
      projectId: "ext:crowdin:42",
      contentType: "image/png",
      filename: "banner-fr.png",
      metadata: { publicMedia: true },
    });
    deleteStoredFileMock.mockResolvedValue(undefined);
    saveTmsProviderLiveCatTranslationMock.mockRejectedValue(
      new TmsProviderLiveError("provider_unauthorized", "Token expired"),
    );

    const formData = new FormData();
    formData.set("sourcePath", "crowdin/home.json");
    formData.set("targetLocale", "fr");
    formData.set("externalStringId", "1001");
    formData.set("externalResourceId", "101");
    formData.set(
      "file",
      new File([Uint8Array.from([137, 80, 78, 71])], "banner-fr.png", { type: "image/png" }),
    );

    const response = await app.request(
      `/api/orgs/${encodeURIComponent(translator.organization.slug ?? "missing-slug")}/projects/${encodeURIComponent("ext:crowdin:42")}/files/detail/cat/images/upload`,
      {
        method: "POST",
        headers: await projectFixture.authHeadersFor(translator),
        body: formData,
      },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(deleteStoredFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "ext:crowdin:42",
        fileId: "file_external-upload-fail",
      }),
    );
  });

  it("rejects native CAT issue posts via comments API", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    const keys = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    const translationKeyId = keys[0]!.id;

    const postResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKeyId,
          text: "Wrong tone.",
          type: "issue",
          issueType: "translation_mistake",
        },
      },
      { headers },
    );

    expect(postResponse.status).toBe(400);
    expect(await postResponse.json()).toMatchObject({
      error: "native_cat_issue_unsupported",
    });

    const linkedIssues = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(eq(schema.issueSheetIssues.projectId, project.id));
    expect(linkedIssues).toEqual([]);

    const resolveResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments[":commentId"].resolve.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          commentId: randomUUID(),
        },
        json: { sourcePath },
      },
      { headers },
    );

    expect(resolveResponse.status).toBe(400);
    expect(await resolveResponse.json()).toMatchObject({
      error: "native_cat_issue_unsupported",
    });
  });

  it("lists and resolves legacy native CAT issue comments", async () => {
    const { identity, project, organization, user } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    const keys = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    const translationKeyId = keys[0]!.id;

    const [legacyIssue] = await db
      .insert(schema.projectTranslationComments)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        translationKeyId,
        targetLocale: "fr-FR",
        type: "issue",
        status: "unresolved",
        text: "Wrong tone.",
        issueType: "translation_mistake",
        authorUserId: user.id,
      })
      .returning({ id: schema.projectTranslationComments.id });

    const commentsResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].comments.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          externalStringId: translationKeyId,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(commentsResponse.status).toBe(200);
    const commentsBody = (await commentsResponse.json()) as ProjectFileCatSegmentCommentsResponse;
    expect(commentsBody.comments).toMatchObject([
      { externalCommentId: legacyIssue!.id, type: "issue", status: "unresolved" },
    ]);

    const resolveResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments[":commentId"].resolve.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          commentId: legacyIssue!.id,
        },
        json: { sourcePath },
      },
      { headers },
    );

    expect(resolveResponse.status).toBe(200);
    expect(await resolveResponse.json()).toMatchObject({
      comment: { externalCommentId: legacyIssue!.id, status: "resolved" },
    });
    expect(resolveTmsProviderLiveCatCommentMock).not.toHaveBeenCalled();
  });

  it("returns Crowdin CAT content for an encoded provider project", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockResolvedValue({
      sourcePath: "crowdin/home.json",
      filename: "home.json",
      provider: {
        kind: "crowdin",
        resourceType: "file",
        externalProjectId: "42",
        externalResourceId: "101",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: null,
      },
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
      segments: [
        {
          externalStringId: "1001",
          key: "hello",
          sourceText: "Hello",
          context: null,
          type: "text",
        },
      ],
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: { sourcePath: "crowdin/home.json", targetLocale: "fr" },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatResponse;
    expect(body.catFile.segments[0]).toMatchObject({ externalStringId: "1001" });
    expect(body.catFile.segments[0]).not.toHaveProperty("target");
    expect(body.catFile.segments[0]).not.toHaveProperty("comments");
    expect(getTmsProviderLiveCatFileMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      "fr",
      expect.objectContaining({
        canEditTranslations: true,
        pagination: expect.objectContaining({
          paginated: true,
          offset: 0,
          limit: 50,
          queueFilter: "all",
        }),
      }),
    );
  });

  it("returns CAT queue content from the split queue endpoint", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockResolvedValue({
      sourcePath: "crowdin/home.json",
      filename: "home.json",
      provider: {
        kind: "crowdin",
        resourceType: "file",
        externalProjectId: "42",
        externalResourceId: "101",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: null,
      },
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
      pagination: {
        offset: 25,
        limit: 25,
        returnedCount: 1,
        totalCount: 26,
        hasMore: false,
      },
      segments: [
        {
          externalStringId: "1002",
          key: "goodbye",
          sourceText: "Goodbye",
          context: null,
          type: "text",
        },
      ],
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          offset: 25,
          limit: 25,
          queueFilter: "has_issues",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatQueueResponse & {
      catFile?: unknown;
    };
    expect(body.catFile).toBeUndefined();
    expect(body.catQueue).toMatchObject({
      sourcePath: "crowdin/home.json",
      pagination: {
        offset: 25,
        limit: 25,
        returnedCount: 1,
        totalCount: 26,
        hasMore: false,
      },
      segments: [
        {
          externalStringId: "1002",
        },
      ],
    });
    expect(getTmsProviderLiveCatFileMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      "fr",
      expect.objectContaining({
        canEditTranslations: true,
        pagination: expect.objectContaining({
          paginated: true,
          offset: 25,
          limit: 25,
          queueFilter: "has_issues",
        }),
      }),
    );
  });

  it("passes pagination params to the provider CAT loader", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockResolvedValue({
      sourcePath: "crowdin/home.json",
      filename: "home.json",
      provider: {
        kind: "crowdin",
        resourceType: "file",
        externalProjectId: "42",
        externalResourceId: "101",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: null,
      },
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
      pagination: {
        offset: 50,
        limit: 25,
        returnedCount: 1,
        totalCount: 120,
        hasMore: true,
      },
      segments: [
        {
          externalStringId: "1002",
          key: "goodbye",
          sourceText: "Goodbye",
          context: null,
          type: "text",
        },
      ],
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          offset: 50,
          limit: 25,
          search: "good",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatResponse;
    expect(body.catFile.pagination).toMatchObject({
      offset: 50,
      limit: 25,
      hasMore: true,
      totalCount: 120,
    });
    expect(getTmsProviderLiveCatFileMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      "fr",
      expect.objectContaining({
        canEditTranslations: true,
        pagination: expect.objectContaining({
          paginated: true,
          offset: 50,
          limit: 25,
          search: "good",
        }),
      }),
    );
  });

  it("returns project_not_found when the provider file is missing", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockResolvedValue(null);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: { sourcePath: "missing.json", targetLocale: "fr" },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "project_not_found" });
  });

  it("returns provider_cat_unsupported for unsupported providers", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "phrase",
      displayName: "Phrase",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockRejectedValue(
      new TmsProviderLiveError(
        "provider_cat_unsupported",
        "CAT editing is not available for this provider file yet.",
      ),
    );

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:phrase:42",
        },
        query: { sourcePath: "phrase/home.json", targetLocale: "fr" },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ error: "provider_cat_unsupported" });
  });

  it("rejects invalid CAT query payloads", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: { sourcePath: "crowdin/home.json", targetLocale: "" },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_project_payload" });
  });

  it("saves Crowdin CAT translations for users with write-back permission", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    saveTmsProviderLiveCatTranslationMock.mockResolvedValue({
      text: "Bonjour",
      externalTranslationId: "9001",
      isApproved: false,
    });
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          externalResourceId: "101",
          text: "Bonjour",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatTranslationResponse;
    expect(body.translation).toMatchObject({ text: "Bonjour", externalTranslationId: "9001" });
    expect(saveTmsProviderLiveCatTranslationMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      { targetLocale: "fr", externalStringId: "1001", externalResourceId: "101", text: "Bonjour" },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catSegmentDraftSaved, {
      source: "external_tms",
      status: "draft",
    });
    trackSpy.mockRestore();
  });

  it("denies CAT translation saves without write-back permission", async () => {
    const member = projectFixture.createWorkosIdentityWithRole("member");

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.$post(
      {
        param: {
          organizationSlug: member.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          text: "Bonjour",
        },
      },
      { headers: await projectFixture.authHeadersFor(member) },
    );

    expect(response.status).toBe(403);
    expect(saveTmsProviderLiveCatTranslationMock).not.toHaveBeenCalled();
  });

  it("posts Crowdin CAT comments for users with write-back permission", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    saveTmsProviderLiveCatCommentMock.mockResolvedValue({
      externalCommentId: "5001",
      type: "comment",
      status: null,
      text: "Please clarify tone.",
      createdAt: "2026-06-19T00:00:00.000Z",
      locale: "fr",
      author: "Reviewer",
    });
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          externalResourceId: "101",
          text: "Please clarify tone.",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileCatCommentResponse;
    expect(body.comment).toMatchObject({
      externalCommentId: "5001",
      text: "Please clarify tone.",
    });
    expect(saveTmsProviderLiveCatCommentMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      {
        targetLocale: "fr",
        externalStringId: "1001",
        externalResourceId: "101",
        text: "Please clarify tone.",
        type: undefined,
        issueType: undefined,
      },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catCommentCreated, {
      source: "external_tms",
      feature: "comment",
    });
    trackSpy.mockRestore();
  });

  it("posts Crowdin CAT issues with issue type for users with write-back permission", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    saveTmsProviderLiveCatCommentMock.mockResolvedValue({
      externalCommentId: "5002",
      type: "issue",
      status: "unresolved",
      text: "Wrong tone.",
      createdAt: "2026-06-19T00:00:00.000Z",
      locale: "fr",
      author: "Reviewer",
    });
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          externalResourceId: "101",
          text: "Wrong tone.",
          type: "issue",
          issueType: "translation_mistake",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    expect(saveTmsProviderLiveCatCommentMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      {
        targetLocale: "fr",
        externalStringId: "1001",
        externalResourceId: "101",
        text: "Wrong tone.",
        type: "issue",
        issueType: "translation_mistake",
      },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.catCommentCreated, {
      source: "external_tms",
      feature: "issue",
    });
    trackSpy.mockRestore();
  });

  it("resolves Crowdin CAT issues for users with write-back permission", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    resolveTmsProviderLiveCatCommentMock.mockResolvedValue({
      externalCommentId: "5002",
      type: "issue",
      status: "resolved",
      text: "Wrong tone.",
      createdAt: "2026-06-19T00:00:00.000Z",
      locale: "fr",
      author: "Reviewer",
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments[":commentId"].resolve.$patch(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
          commentId: "5002",
        },
        json: {
          sourcePath: "crowdin/home.json",
          externalResourceId: "101",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    expect(resolveTmsProviderLiveCatCommentMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      {
        externalCommentId: "5002",
        externalResourceId: "101",
      },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
  });

  it("denies CAT comment posts without write-back permission", async () => {
    const member = projectFixture.createWorkosIdentityWithRole("member");

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments.$post(
      {
        param: {
          organizationSlug: member.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          text: "Please clarify tone.",
        },
      },
      { headers: await projectFixture.authHeadersFor(member) },
    );

    expect(response.status).toBe(403);
    expect(saveTmsProviderLiveCatCommentMock).not.toHaveBeenCalled();
  });

  it("hides and unhides native CAT source strings in bulk", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    const { imported } = await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [
        { key: "greeting", text: "Hello", context: null },
        { key: "farewell", text: "Goodbye", context: null },
      ],
    });
    expect(imported).toBe(2);

    const keys = await db
      .select({
        id: schema.projectTranslationKeys.id,
        key: schema.projectTranslationKeys.key,
      })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
    const greeting = keys.find((row) => row.key === "greeting");
    const farewell = keys.find((row) => row.key === "farewell");
    expect(greeting).toBeDefined();
    expect(farewell).toBeDefined();

    const hideResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.hidden.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          externalStringIds: [greeting!.id, farewell!.id],
          isHidden: true,
        },
      },
      { headers },
    );

    expect(hideResponse.status).toBe(200);
    expect(await hideResponse.json()).toEqual({ updatedCount: 2, isHidden: true });

    const hiddenQueue = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR", queueFilter: "hidden" },
      },
      { headers },
    );

    expect(hiddenQueue.status).toBe(200);
    const hiddenBody = (await hiddenQueue.json()) as ProjectFileCatQueueResponse;
    expect(hiddenBody.catQueue.segments).toHaveLength(2);
    expect(hiddenBody.catQueue.segments.every((segment) => segment.isHidden === true)).toBe(true);

    const unhideResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.hidden.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          externalStringIds: [greeting!.id],
          isHidden: false,
        },
      },
      { headers },
    );

    expect(unhideResponse.status).toBe(200);
    expect(await unhideResponse.json()).toEqual({ updatedCount: 1, isHidden: false });

    const remainingHidden = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR", queueFilter: "hidden" },
      },
      { headers },
    );
    const remainingBody = (await remainingHidden.json()) as ProjectFileCatQueueResponse;
    expect(remainingBody.catQueue.segments.map((segment) => segment.externalStringId)).toEqual([
      farewell!.id,
    ]);
  });

  it("hides Crowdin CAT strings for users with write-back permission", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    setTmsProviderLiveCatStringsHiddenMock.mockResolvedValue({
      updatedCount: 2,
      isHidden: true,
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.hidden.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          externalStringIds: ["1001", "1002"],
          isHidden: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 2, isHidden: true });
    expect(setTmsProviderLiveCatStringsHiddenMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      { externalStringIds: ["1001", "1002"], isHidden: true },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
  });

  it("denies CAT hidden-string updates without write-back permission", async () => {
    const member = projectFixture.createWorkosIdentityWithRole("member");

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.hidden.$post(
      {
        param: {
          organizationSlug: member.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          externalStringIds: ["1001"],
          isHidden: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(member) },
    );

    expect(response.status).toBe(403);
    expect(setTmsProviderLiveCatStringsHiddenMock).not.toHaveBeenCalled();
  });

  it("rejects CAT hidden-string updates for non-Crowdin providers", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "phrase",
      displayName: "Phrase",
      validationStatus: "valid",
      validationMessage: null,
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.hidden.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:phrase:42",
        },
        json: {
          sourcePath: "phrase/home.json",
          externalStringIds: ["1001"],
          isHidden: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "provider_cat_unsupported" });
    expect(setTmsProviderLiveCatStringsHiddenMock).not.toHaveBeenCalled();
  });

  it("locks and unlocks native CAT segments and shows isLocked on the queue", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    const { imported } = await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [
        { key: "greeting", text: "Hello", context: null },
        { key: "farewell", text: "Goodbye", context: null },
      ],
    });
    expect(imported).toBe(2);

    const keys = await db
      .select({
        id: schema.projectTranslationKeys.id,
        key: schema.projectTranslationKeys.key,
      })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
    const greeting = keys.find((row) => row.key === "greeting");
    const farewell = keys.find((row) => row.key === "farewell");
    expect(greeting).toBeDefined();
    expect(farewell).toBeDefined();

    const lockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringIds: [greeting!.id, farewell!.id],
          isLocked: true,
        },
      },
      { headers },
    );

    expect(lockResponse.status).toBe(200);
    expect(await lockResponse.json()).toEqual({
      catSegmentLock: { updatedCount: 2, isLocked: true },
    });

    const lockedQueue = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );

    expect(lockedQueue.status).toBe(200);
    const lockedBody = (await lockedQueue.json()) as ProjectFileCatQueueResponse;
    expect(lockedBody.catQueue.segments.every((segment) => segment.isLocked === true)).toBe(true);

    const saveResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: greeting!.id,
          text: "Bonjour",
        },
      },
      { headers },
    );
    expect(saveResponse.status).toBe(409);
    expect(await saveResponse.json()).toMatchObject({ error: "translation_locked" });

    const unlockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringIds: [greeting!.id],
          isLocked: false,
        },
      },
      { headers },
    );
    expect(unlockResponse.status).toBe(200);
    expect(await unlockResponse.json()).toEqual({
      catSegmentLock: { updatedCount: 1, isLocked: false },
    });

    const remainingQueue = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        query: { sourcePath, targetLocale: "fr-FR" },
      },
      { headers },
    );
    const remainingBody = (await remainingQueue.json()) as ProjectFileCatQueueResponse;
    const greetingSegment = remainingBody.catQueue.segments.find(
      (segment) => segment.externalStringId === greeting!.id,
    );
    const farewellSegment = remainingBody.catQueue.segments.find(
      (segment) => segment.externalStringId === farewell!.id,
    );
    expect(greetingSegment?.isLocked).toBeUndefined();
    expect(farewellSegment?.isLocked).toBe(true);
  });

  it("locks Crowdin CAT segments without calling the provider hide API", async () => {
    const translator = projectFixture.createWorkosIdentityWithRole("translator");
    getTmsProviderConnectionMock.mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });
    getTmsProviderLiveCatFileMock.mockResolvedValue({
      sourcePath: "crowdin/home.json",
      filename: "home.json",
      provider: {
        kind: "crowdin",
        resourceType: "file",
        externalProjectId: "42",
        externalResourceId: "101",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: null,
      },
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
      pagination: {
        offset: 0,
        limit: 50,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
      },
      segments: [
        {
          externalStringId: "1001",
          key: "home.title",
          sourceText: "Home",
          context: null,
          type: null,
        },
      ],
      targetsByExternalStringId: {},
    });

    const lockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringIds: ["1001"],
          isLocked: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );

    expect(lockResponse.status).toBe(200);
    expect(await lockResponse.json()).toEqual({
      catSegmentLock: { updatedCount: 1, isLocked: true },
    });
    expect(setTmsProviderLiveCatStringsHiddenMock).not.toHaveBeenCalled();

    const queueResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.queue.$get(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        query: { sourcePath: "crowdin/home.json", targetLocale: "fr" },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );
    expect(queueResponse.status).toBe(200);
    const queueBody = (await queueResponse.json()) as ProjectFileCatQueueResponse;
    expect(queueBody.catQueue.segments[0]?.isLocked).toBe(true);

    const saveResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.$post(
      {
        param: {
          organizationSlug: translator.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringId: "1001",
          text: "Accueil",
        },
      },
      { headers: await projectFixture.authHeadersFor(translator) },
    );
    expect(saveResponse.status).toBe(409);
    expect(await saveResponse.json()).toMatchObject({ error: "translation_locked" });
    expect(saveTmsProviderLiveCatTranslationMock).not.toHaveBeenCalled();
  });

  it("denies CAT lock updates without write-back permission", async () => {
    const member = projectFixture.createWorkosIdentityWithRole("member");

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: member.organization.slug ?? "missing-slug",
          projectId: "ext:crowdin:42",
        },
        json: {
          sourcePath: "crowdin/home.json",
          targetLocale: "fr",
          externalStringIds: ["1001"],
          isLocked: true,
        },
      },
      { headers: await projectFixture.authHeadersFor(member) },
    );

    expect(response.status).toBe(403);
  });

  it("rejects file-backed image status updates when the segment is locked", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "assets/hero.png";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    await ensureImageVariantsForSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      repositorySourceFileId: sourceFile.id,
      targetLocales: ["fr-FR"],
    });

    const lockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringIds: [sourceFile.id],
          isLocked: true,
        },
      },
      { headers },
    );
    expect(lockResponse.status).toBe(200);

    const lockedStatusResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.images.status.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          status: "approved",
        },
      },
      { headers },
    );
    expect(lockedStatusResponse.status).toBe(409);
    expect(await lockedStatusResponse.json()).toMatchObject({ error: "translation_locked" });

    const unlockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringIds: [sourceFile.id],
          isLocked: false,
        },
      },
      { headers },
    );
    expect(unlockResponse.status).toBe(200);

    const statusResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.images.status.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          status: "approved",
        },
      },
      { headers },
    );
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({
      imageVariant: { status: "approved" },
    });
  });

  it("returns project_not_found when locking segments on an unknown native project", async () => {
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: randomUUID(),
        },
        json: {
          sourcePath: "locales/en.json",
          targetLocale: "fr-FR",
          externalStringIds: ["key-1"],
          isLocked: true,
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "project_not_found" });
  });

  it("rejects native translation status updates when the segment is locked", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    const { imported } = await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });
    expect(imported).toBe(1);

    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);
    expect(translationKey).toBeDefined();

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: translationKey!.id,
      targetLocale: "fr-FR",
      text: "Bonjour",
      status: "draft",
    });

    const lockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringIds: [translationKey!.id],
          isLocked: true,
        },
      },
      { headers },
    );
    expect(lockResponse.status).toBe(200);

    const statusResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.translations.status.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringId: translationKey!.id,
          status: "approved",
        },
      },
      { headers },
    );
    expect(statusResponse.status).toBe(409);
    expect(await statusResponse.json()).toMatchObject({ error: "translation_locked" });
  });

  it("rejects image status updates when locked via the image: alias id", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const sourcePath = "assets/banner.png";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });

    await ensureImageVariantsForSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      repositorySourceFileId: sourceFile.id,
      targetLocales: ["fr-FR"],
    });

    const lockResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.strings.locked.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          externalStringIds: [`image:${sourcePath}`],
          isLocked: true,
        },
      },
      { headers },
    );
    expect(lockResponse.status).toBe(200);

    const lockedStatusResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.images.status.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: {
          sourcePath,
          targetLocale: "fr-FR",
          status: "approved",
        },
      },
      { headers },
    );
    expect(lockedStatusResponse.status).toBe(409);
    expect(await lockedStatusResponse.json()).toMatchObject({ error: "translation_locked" });
  });
});
