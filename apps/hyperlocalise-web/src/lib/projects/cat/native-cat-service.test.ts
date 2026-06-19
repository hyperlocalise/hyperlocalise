import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectStringContextService } from "@/lib/projects/string-context/project-string-context-service";
import type { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { NativeCatService } from "./native-cat-service";

describe("NativeCatService.getCatFile", () => {
  const getRepositorySourceFileByPath = vi.fn();
  const listKeysForFile = vi.fn();
  const countKeysForFile = vi.fn();
  const getTranslationsByKeyIds = vi.fn();
  const listCached = vi.fn();

  let service: NativeCatService;

  beforeEach(() => {
    vi.clearAllMocks();
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    getTranslationsByKeyIds.mockResolvedValue([]);

    const translations = {
      getRepositorySourceFileByPath,
      listKeysForFile,
      countKeysForFile,
      getTranslationsByKeyIds,
    } as unknown as ProjectTranslationService;

    const stringContext = {
      listCached,
    } as unknown as ProjectStringContextService;

    service = new NativeCatService(undefined as never, translations, stringContext);
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
    countKeysForFile.mockResolvedValue(120);
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
  });
});
