import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { NativeCatCommentService } from "./native-cat-comment-service";
import { NativeCatService } from "./native-cat-service";

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
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
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
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
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
      },
    ]);

    const result = await service.getCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
    });

    expect(result?.segments[0]?.maxLength).toBeUndefined();
  });
});
