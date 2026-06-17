import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  getRepositorySourceFileByPathMock,
  listProjectTranslationKeysForFileMock,
  countProjectTranslationKeysForFileMock,
  getProjectTranslationsByKeyIdsMock,
} = vi.hoisted(() => ({
  getRepositorySourceFileByPathMock: vi.fn(),
  listProjectTranslationKeysForFileMock: vi.fn(),
  countProjectTranslationKeysForFileMock: vi.fn(),
  getProjectTranslationsByKeyIdsMock: vi.fn(),
}));

vi.mock("@/lib/projects/project-translation-keys", () => ({
  getRepositorySourceFileByPath: (...args: unknown[]) => getRepositorySourceFileByPathMock(...args),
  listProjectTranslationKeysForFile: (...args: unknown[]) =>
    listProjectTranslationKeysForFileMock(...args),
  countProjectTranslationKeysForFile: (...args: unknown[]) =>
    countProjectTranslationKeysForFileMock(...args),
  getProjectTranslationsByKeyIds: (...args: unknown[]) =>
    getProjectTranslationsByKeyIdsMock(...args),
}));

import { getNativeProjectCatFile } from "./native-project-cat";

describe("getNativeProjectCatFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRepositorySourceFileByPathMock.mockResolvedValue({ id: "file_1" });
    getProjectTranslationsByKeyIdsMock.mockResolvedValue([]);
  });

  it("returns null when the source file is missing", async () => {
    getRepositorySourceFileByPathMock.mockResolvedValue(null);

    const result = await getNativeProjectCatFile({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      canEditTranslations: true,
    });

    expect(result).toBeNull();
  });

  it("loads a paginated page with search and pagination metadata", async () => {
    countProjectTranslationKeysForFileMock.mockResolvedValue(120);
    listProjectTranslationKeysForFileMock.mockResolvedValue([
      {
        id: "key_51",
        key: "hero.title",
        sourceText: "Welcome",
        context: null,
        type: "text",
      },
    ]);

    const result = await getNativeProjectCatFile({
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

    expect(listProjectTranslationKeysForFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 50,
        limit: 25,
        search: "hero",
      }),
    );
    expect(countProjectTranslationKeysForFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: "hero" }),
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
