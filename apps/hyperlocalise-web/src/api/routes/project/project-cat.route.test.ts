import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";
import { TmsProviderLiveError } from "@/lib/providers/tms-provider-live";

import { createProjectTestFixture } from "./project.fixture";
import { ok } from "@/lib/primitives/result/results";
import type {
  ProjectFileCatConcordanceResponse,
  ProjectFileCatRecommendationResponse,
  ProjectFileCatResponse,
  ProjectFileCatTranslationResponse,
} from "./project.schema";

const {
  getTmsProviderConnectionMock,
  getTmsProviderLiveCatFileMock,
  saveTmsProviderLiveCatTranslationMock,
  loadCatSegmentConcordanceMock,
  generateCatAiRecommendationMock,
  ensureOrganizationProjectRecordMock,
} = vi.hoisted(() => ({
  getTmsProviderConnectionMock: vi.fn(),
  getTmsProviderLiveCatFileMock: vi.fn(),
  saveTmsProviderLiveCatTranslationMock: vi.fn(),
  loadCatSegmentConcordanceMock: vi.fn(),
  generateCatAiRecommendationMock: vi.fn(),
  ensureOrganizationProjectRecordMock: vi.fn(),
}));

vi.mock("@/lib/translation/load-cat-segment-concordance", () => ({
  loadCatSegmentConcordance: (...args: unknown[]) => loadCatSegmentConcordanceMock(...args),
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
        externalProjectId: "42",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello workspace",
      }),
    );
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
          comments: [
            {
              externalCommentId: "42",
              type: "issue",
              status: "unresolved",
              text: "Needs product wording",
              createdAt: "2026-06-08T00:00:00Z",
              locale: "fr",
            },
          ],
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
      comments: [{ type: "issue", status: "unresolved" }],
    });
    expect(getTmsProviderLiveCatFileMock).toHaveBeenCalledWith(
      expect.any(String),
      "42",
      "crowdin/home.json",
      "fr",
      expect.objectContaining({
        canEditTranslations: true,
        pagination: expect.objectContaining({ paginated: false }),
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
});
