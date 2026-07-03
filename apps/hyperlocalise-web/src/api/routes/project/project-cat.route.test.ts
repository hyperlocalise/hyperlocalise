import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { eq } from "drizzle-orm";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { upsertProjectTranslationKeysFromEntries } from "@/lib/projects/translations/project-translation-service";
import { TmsProviderLiveError } from "@/lib/providers/tms-provider-live";

import { createProjectTestFixture } from "./project.fixture";
import { ok } from "@/lib/primitives/result/results";
import type {
  ProjectFileCatConcordanceResponse,
  ProjectFileCatCommentResponse,
  ProjectFileCatQueueResponse,
  ProjectFileCatRecommendationResponse,
  ProjectFileCatResponse,
  ProjectFileCatSegmentCommentsResponse,
  ProjectFileCatSegmentResponse,
  ProjectFileCatTranslationResponse,
} from "./project.schema";

const {
  getTmsProviderConnectionMock,
  getTmsProviderLiveCatFileMock,
  saveTmsProviderLiveCatTranslationMock,
  saveTmsProviderLiveCatCommentMock,
  resolveTmsProviderLiveCatCommentMock,
  loadCatSegmentConcordanceMock,
  loadCatSegmentVisualContextMock,
  generateCatAiRecommendationMock,
  ensureOrganizationProjectRecordMock,
} = vi.hoisted(() => ({
  getTmsProviderConnectionMock: vi.fn(),
  getTmsProviderLiveCatFileMock: vi.fn(),
  saveTmsProviderLiveCatTranslationMock: vi.fn(),
  saveTmsProviderLiveCatCommentMock: vi.fn(),
  resolveTmsProviderLiveCatCommentMock: vi.fn(),
  loadCatSegmentConcordanceMock: vi.fn(),
  loadCatSegmentVisualContextMock: vi.fn(),
  generateCatAiRecommendationMock: vi.fn(),
  ensureOrganizationProjectRecordMock: vi.fn(),
}));

vi.mock("@/lib/translation/load-cat-segment-concordance", () => ({
  loadCatSegmentConcordance: (...args: unknown[]) => loadCatSegmentConcordanceMock(...args),
}));

vi.mock("@/lib/translation/load-cat-segment-visual-context", () => ({
  loadCatSegmentVisualContext: (...args: unknown[]) => loadCatSegmentVisualContextMock(...args),
}));

vi.mock("@/lib/translation/generate-cat-ai-recommendation", () => ({
  generateCatAiRecommendation: (...args: unknown[]) => generateCatAiRecommendationMock(...args),
}));

vi.mock("@/lib/projects/organization/organization-project-service", () => ({
  ensureOrganizationProjectRecord: (...args: unknown[]) =>
    ensureOrganizationProjectRecordMock(...args),
}));

vi.mock("@/lib/providers/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderConnection: (...args: unknown[]) => getTmsProviderConnectionMock(...args),
    getTmsProviderLiveCatFile: (...args: unknown[]) => getTmsProviderLiveCatFileMock(...args),
    saveTmsProviderLiveCatTranslation: (...args: unknown[]) =>
      saveTmsProviderLiveCatTranslationMock(...args),
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
  await projectFixture.cleanup();
});

describe("project file CAT routes", () => {
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
    expect(body.catFile.segments[0]?.comments).toEqual([]);
    expect(body.catFile.segments[0]?.commentCount).toBe(1);

    const detailResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.segments[":externalStringId"].$get(
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

    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as ProjectFileCatSegmentResponse;
    expect(detailBody.segment.comments).toEqual([]);

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

  it("posts and resolves native CAT issues", async () => {
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

    expect(postResponse.status).toBe(200);
    const posted = (await postResponse.json()) as ProjectFileCatCommentResponse;
    expect(posted.comment).toMatchObject({
      type: "issue",
      status: "unresolved",
      text: "Wrong tone.",
    });

    const resolveResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.cat.comments[":commentId"].resolve.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
          commentId: posted.comment.externalCommentId,
        },
        json: { sourcePath },
      },
      { headers },
    );

    expect(resolveResponse.status).toBe(200);
    expect(await resolveResponse.json()).toMatchObject({
      comment: {
        externalCommentId: posted.comment.externalCommentId,
        status: "resolved",
      },
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
          target: { text: "Bonjour", externalTranslationId: "9001", isApproved: true },
          comments: [],
          unresolvedIssueCount: 1,
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
    expect(body.catFile.segments[0]).toMatchObject({
      externalStringId: "1001",
      target: { text: "Bonjour", isApproved: true },
      comments: [],
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
          target: null,
          comments: [],
          commentCount: 2,
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
          comments: [],
          commentCount: 2,
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
          target: null,
          comments: [],
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
});
