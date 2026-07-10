import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { NativeCatCommentService } from "./native-cat-comment-service";
import { NativeCatService } from "./native-cat-service";

const getLatestRepositorySourceFileVersion = vi.fn();
const getImageVariant = vi.fn();

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
    getLatestRepositorySourceFileVersion(...args),
}));

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  getImageVariant: (...args: unknown[]) => getImageVariant(...args),
  projectImageAssetPath: (input: { organizationSlug: string; projectId: string; fileId: string }) =>
    `/api/orgs/${input.organizationSlug}/projects/${input.projectId}/assets/${input.fileId}`,
}));

describe("NativeCatService.getCatFile", () => {
  const getRepositorySourceFileByPath = vi.fn();
  const listKeysForFile = vi.fn();
  const countKeysForFile = vi.fn();
  const getTranslationsByKeyIds = vi.fn();
  let service: NativeCatService;

  beforeEach(() => {
    vi.clearAllMocks();
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    getTranslationsByKeyIds.mockResolvedValue([]);
    getLatestRepositorySourceFileVersion.mockResolvedValue(null);
    getImageVariant.mockResolvedValue(null);
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
});
