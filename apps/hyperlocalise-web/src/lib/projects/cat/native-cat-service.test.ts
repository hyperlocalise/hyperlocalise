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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { NativeCatCommentService } from "./native-cat-comment-service";
import { fileBackedCatSegmentIds, NativeCatService } from "./native-cat-service";

const getLatestRepositorySourceFileVersion = vi.fn();
const getImageVariant = vi.fn();
const getVideoVariant = vi.fn();

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
    getLatestRepositorySourceFileVersion(...args),
}));

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  getImageVariant: (...args: unknown[]) => getImageVariant(...args),
  projectImageAssetPath: (input: { organizationSlug: string; projectId: string; fileId: string }) =>
    `/api/orgs/${input.organizationSlug}/projects/${input.projectId}/assets/${input.fileId}`,
}));

vi.mock("@/lib/projects/files/video-variant-service", () => ({
  getVideoVariant: (...args: unknown[]) => getVideoVariant(...args),
  projectVideoAssetPath: (input: { organizationSlug: string; projectId: string; fileId: string }) =>
    `/api/orgs/${input.organizationSlug}/projects/${input.projectId}/assets/${input.fileId}`,
}));

describe("fileBackedCatSegmentIds", () => {
  it("includes the source file id and legacy path aliases", () => {
    expect(fileBackedCatSegmentIds("file_1", "assets/hero.png")).toEqual([
      "file_1",
      "binary:assets/hero.png",
      "image:assets/hero.png",
      "video:assets/hero.png",
    ]);
  });

  it("omits a missing source file id", () => {
    expect(fileBackedCatSegmentIds(null, "assets/hero.png")).toEqual([
      "binary:assets/hero.png",
      "image:assets/hero.png",
      "video:assets/hero.png",
    ]);
  });
});

describe("NativeCatService.getCatFile", () => {
  const getRepositorySourceFileByPath = vi.fn();
  const listKeysForFile = vi.fn();
  const countKeysForFile = vi.fn();
  const getTranslationsByKeyIds = vi.fn();
  const setKeysHidden = vi.fn();
  let service: NativeCatService;

  beforeEach(() => {
    vi.clearAllMocks();
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    getTranslationsByKeyIds.mockResolvedValue([]);
    getLatestRepositorySourceFileVersion.mockResolvedValue(null);
    getImageVariant.mockResolvedValue(null);
    getVideoVariant.mockResolvedValue(null);
    countKeysForFile.mockImplementation(async (input) => {
      if (input.queueFilter === "reviewed") {
        return 45;
      }
      if (input.queueFilter === "untranslated") {
        return 30;
      }
      if (input.queueFilter === "needs_review") {
        return 40;
      }
      if (input.queueFilter === "has_issues") {
        return 5;
      }
      return 120;
    });

    const translations = {
      getRepositorySourceFileByPath,
      listKeysForFile,
      countKeysForFile,
      getTranslationsByKeyIds,
      setKeysHidden,
    } as unknown as ProjectTranslationService;

    service = new NativeCatService(undefined as never, translations, {} as NativeCatCommentService);
  });

  it("returns null when the source file is missing", async () => {
    getRepositorySourceFileByPath.mockResolvedValue(null);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(result).toBeNull();
  });

  it("loads a paginated page with search and pagination metadata", async () => {
    listKeysForFile.mockResolvedValue([
      {
        id: "key_51",
        key: "hero.title",
        sourceText: "Welcome",
        context: null,
        type: "text",
        maxLength: null,
        metadata: {},
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
      pagination: {
        offset: 50,
        limit: 25,
        search: "hero",
        paginated: true,
      },
    });

    expect(listKeysForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 50,
        limit: 25,
        search: "hero",
        targetLocale: "fr",
      }),
    );
    expect(countKeysForFile).toHaveBeenCalledWith(
      expect.objectContaining({ search: "hero", targetLocale: "fr" }),
    );
    expect(result?.pagination).toMatchObject({
      offset: 50,
      limit: 25,
      returnedCount: 1,
      totalCount: 120,
      hasMore: true,
    });
    expect(result?.segments[0]).toMatchObject({
      externalStringId: "key_51",
      key: "hero.title",
      sourceText: "Welcome",
    });
    expect(result?.segments[0]).not.toHaveProperty("target");
    expect(getTranslationsByKeyIds).not.toHaveBeenCalled();
    expect(result?.segments[0]?.maxLength).toBeUndefined();
  });

  it("forwards untranslated-first sort to the key listing query", async () => {
    listKeysForFile.mockResolvedValue([]);

    await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
      pagination: {
        offset: 0,
        limit: 50,
        paginated: true,
        queueSort: "untranslated_first",
      },
    });

    expect(listKeysForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        queueSort: "untranslated_first",
        targetLocale: "fr",
      }),
    );
    expect(countKeysForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLocale: "fr",
      }),
    );
    expect(countKeysForFile.mock.calls[0]?.[0]).not.toHaveProperty("queueSort");
  });

  it("includes maxLength on segments when the translation key has one", async () => {
    listKeysForFile.mockResolvedValue([
      {
        id: "key_1",
        key: "hero.cta",
        sourceText: "Get started",
        context: null,
        type: "text",
        maxLength: 24,
        metadata: {},
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(result?.segments[0]?.maxLength).toBe(24);
  });

  it("omits maxLength when the translation key has a non-positive value", async () => {
    listKeysForFile.mockResolvedValue([
      {
        id: "key_1",
        key: "hero.cta",
        sourceText: "Get started",
        context: null,
        type: "text",
        maxLength: 0,
        metadata: {},
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(result?.segments[0]?.maxLength).toBeUndefined();
  });

  it("maps isHidden onto CAT segments when the translation key is hidden", async () => {
    listKeysForFile.mockResolvedValue([
      {
        id: "key_hidden",
        key: "debug.id",
        sourceText: "Internal id",
        context: null,
        type: "text",
        maxLength: null,
        metadata: {},
        isHidden: true,
      },
      {
        id: "key_visible",
        key: "hero.title",
        sourceText: "Welcome",
        context: null,
        type: "text",
        maxLength: null,
        metadata: {},
        isHidden: false,
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(result?.segments[0]).toMatchObject({
      externalStringId: "key_hidden",
      isHidden: true,
    });
    expect(result?.segments[1]).not.toHaveProperty("isHidden");
  });

  it("returns a synthetic image_file segment for png sources", async () => {
    getLatestRepositorySourceFileVersion.mockResolvedValue({
      storedFileId: "stored_source_1",
    });
    getImageVariant.mockResolvedValue({
      id: "variant_1",
      storedFileId: "stored_target_1",
      status: "needs_review",
    });

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "assets/hero.png",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(listKeysForFile).not.toHaveBeenCalled();
    expect(result?.segments).toHaveLength(1);
    expect(result?.segments[0]).toMatchObject({
      externalStringId: "file_1",
      key: "assets/hero.png",
      sourceText: "assets/hero.png",
      contentKind: "image_file",
      sourceAssetUrl: "/api/orgs/acme/projects/project_1/assets/stored_source_1",
      targetAssetUrl: "/api/orgs/acme/projects/project_1/assets/stored_target_1",
      imageVariantId: "variant_1",
    });
  });

  it("returns a synthetic video_file segment for mp4 sources", async () => {
    getLatestRepositorySourceFileVersion.mockResolvedValue({
      storedFileId: "stored_source_video",
    });
    getVideoVariant.mockResolvedValue({
      id: "variant_video",
      storedFileId: "stored_target_video",
      status: "needs_review",
    });

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "assets/hero.mp4",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(listKeysForFile).not.toHaveBeenCalled();
    expect(getImageVariant).not.toHaveBeenCalled();
    expect(result?.segments).toHaveLength(1);
    expect(result?.segments[0]).toMatchObject({
      externalStringId: "file_1",
      key: "assets/hero.mp4",
      sourceText: "assets/hero.mp4",
      contentKind: "video_file",
      sourceAssetUrl: "/api/orgs/acme/projects/project_1/assets/stored_source_video",
      targetAssetUrl: "/api/orgs/acme/projects/project_1/assets/stored_target_video",
      imageVariantId: "variant_video",
    });
  });

  it("returns a synthetic office_file segment for docx sources", async () => {
    getLatestRepositorySourceFileVersion.mockResolvedValue({
      storedFileId: "stored_source_docx",
    });
    getImageVariant.mockResolvedValue({
      id: "variant_docx",
      storedFileId: "stored_target_docx",
      status: "draft",
    });

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "docs/brief.docx",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(listKeysForFile).not.toHaveBeenCalled();
    expect(result?.segments).toHaveLength(1);
    expect(result?.segments[0]).toMatchObject({
      externalStringId: "file_1",
      key: "docs/brief.docx",
      sourceText: "docs/brief.docx",
      contentKind: "office_file",
      sourceAssetUrl: "/api/orgs/acme/projects/project_1/assets/stored_source_docx",
      targetAssetUrl: "/api/orgs/acme/projects/project_1/assets/stored_target_docx",
      imageVariantId: "variant_docx",
    });
  });

  it("marks image URL keys with contentKind and looksLikeImageUrl", async () => {
    listKeysForFile.mockResolvedValue([
      {
        id: "key_img",
        key: "banner.url",
        sourceText: "https://cdn.example.com/banner.png",
        context: null,
        type: "text",
        maxLength: null,
        metadata: { contentKind: "image_url" },
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(result?.segments[0]).toMatchObject({
      contentKind: "image_url",
      sourceAssetUrl: "https://cdn.example.com/banner.png",
      looksLikeImageUrl: true,
    });
  });

  it("marks video URL keys with contentKind and looksLikeVideoUrl", async () => {
    listKeysForFile.mockResolvedValue([
      {
        id: "key_video",
        key: "banner.video",
        sourceText: "https://cdn.example.com/banner.mp4",
        context: null,
        type: "text",
        maxLength: null,
        metadata: { contentKind: "video_url" },
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
      organizationSlug: "acme",
    });

    expect(result?.segments[0]).toMatchObject({
      contentKind: "video_url",
      sourceAssetUrl: "https://cdn.example.com/banner.mp4",
      looksLikeVideoUrl: true,
    });
  });

  it("scopes hidden updates to the source file when sourcePath is provided", async () => {
    setKeysHidden.mockResolvedValue({ updatedCount: 1 });

    await service.setKeysHidden({
      organizationId: "org_1",
      projectId: "project_1",
      translationKeyIds: ["key_1", "key_2"],
      isHidden: true,
      sourcePath: "locales/en.json",
    });

    expect(getRepositorySourceFileByPath).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
    });
    expect(setKeysHidden).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      translationKeyIds: ["key_1", "key_2"],
      isHidden: true,
      repositorySourceFileId: "file_1",
    });
  });

  it("does not update hidden state when the source file is missing", async () => {
    getRepositorySourceFileByPath.mockResolvedValueOnce(null);

    await expect(
      service.setKeysHidden({
        organizationId: "org_1",
        projectId: "project_1",
        translationKeyIds: ["key_1"],
        isHidden: true,
        sourcePath: "locales/missing.json",
      }),
    ).resolves.toEqual({ updatedCount: 0 });

    expect(setKeysHidden).not.toHaveBeenCalled();
  });
});
