import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { limitMock, selectMock, whereMock } = vi.hoisted(() => {
  const limitMock = vi.fn(async (): Promise<unknown[]> => []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return { limitMock, selectMock, whereMock };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  sql: vi.fn((strings: TemplateStringsArray) => ({ sql: strings.join("") })),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: selectMock,
  },
  schema: {
    repositorySourceFiles: {
      id: "id",
      sourcePath: "sourcePath",
      organizationId: "organizationId",
      projectId: "projectId",
    },
    projectTranslationKeys: {
      id: "id",
      key: "key",
      sourceText: "sourceText",
      context: "context",
      type: "type",
      maxLength: "maxLength",
      organizationId: "organizationId",
      projectId: "projectId",
      repositorySourceFileId: "repositorySourceFileId",
    },
    projectTranslations: {
      id: "id",
      translationKeyId: "translationKeyId",
      text: "text",
      status: "status",
      organizationId: "organizationId",
      projectId: "projectId",
      targetLocale: "targetLocale",
    },
  },
}));

import { loadProjectTranslationsAsPrefilledEntries } from "./project-translation-keys";

describe("loadProjectTranslationsAsPrefilledEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([]);
  });

  it("returns an empty map when the source file is not linked to the project", async () => {
    const result = await loadProjectTranslationsAsPrefilledEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
    });

    expect(result).toEqual({
      prefilled: {},
      truncated: false,
      loadedKeyCount: 0,
      maxKeyCount: 5_000,
    });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("maps existing project translations to entry keys", async () => {
    limitMock
      .mockResolvedValueOnce([{ id: "repo_file_1", sourcePath: "locales/en.json" }])
      .mockResolvedValueOnce([
        { id: "key_1", key: "greeting", sourceText: "Hello" },
        { id: "key_2", key: "farewell", sourceText: "Goodbye" },
        { id: "key_3", key: "empty", sourceText: "Pending" },
      ]);

    whereMock.mockImplementationOnce(() => ({
      limit: limitMock,
    }));
    whereMock.mockImplementationOnce(() => ({
      limit: limitMock,
    }));
    whereMock.mockImplementationOnce(
      () =>
        Promise.resolve([
          { id: "translation_1", translationKeyId: "key_1", text: "Bonjour", status: "approved" },
          { id: "translation_2", translationKeyId: "key_2", text: "Au revoir", status: "draft" },
          { id: "translation_3", translationKeyId: "key_3", text: "   ", status: "draft" },
        ]) as unknown as { limit: typeof limitMock },
    );

    const result = await loadProjectTranslationsAsPrefilledEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
    });

    expect(result).toEqual({
      prefilled: {
        greeting: "Bonjour",
        farewell: "Au revoir",
      },
      truncated: false,
      loadedKeyCount: 3,
      maxKeyCount: 5_000,
    });
    expect(selectMock).toHaveBeenCalledTimes(3);
  });

  it("excludes rejected translations even when text is present", async () => {
    limitMock
      .mockResolvedValueOnce([{ id: "repo_file_1", sourcePath: "locales/en.json" }])
      .mockResolvedValueOnce([{ id: "key_1", key: "greeting", sourceText: "Hello" }]);

    whereMock.mockImplementationOnce(() => ({
      limit: limitMock,
    }));
    whereMock.mockImplementationOnce(() => ({
      limit: limitMock,
    }));
    whereMock.mockImplementationOnce(
      () =>
        Promise.resolve([
          {
            id: "translation_1",
            translationKeyId: "key_1",
            text: "Mauvais",
            status: "rejected",
          },
        ]) as unknown as { limit: typeof limitMock },
    );

    const result = await loadProjectTranslationsAsPrefilledEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
    });

    expect(result.prefilled).toEqual({});
    expect(result.truncated).toBe(false);
    expect(result.loadedKeyCount).toBe(1);
  });

  it("reports truncation when the source file exceeds the prefill key cap", async () => {
    const overLimitKeys = Array.from({ length: 5_001 }, (_, index) => ({
      id: `key_${index}`,
      key: `entry_${index}`,
      sourceText: `Source ${index}`,
    }));

    limitMock
      .mockResolvedValueOnce([{ id: "repo_file_1", sourcePath: "locales/en.json" }])
      .mockResolvedValueOnce(overLimitKeys);

    whereMock.mockImplementationOnce(() => ({
      limit: limitMock,
    }));
    whereMock.mockImplementationOnce(() => ({
      limit: limitMock,
    }));
    whereMock.mockImplementationOnce(
      () => Promise.resolve([]) as unknown as { limit: typeof limitMock },
    );

    const result = await loadProjectTranslationsAsPrefilledEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
    });

    expect(result.truncated).toBe(true);
    expect(result.loadedKeyCount).toBe(5_000);
    expect(result.maxKeyCount).toBe(5_000);
    expect(Object.keys(result.prefilled)).toHaveLength(0);
  });
});
