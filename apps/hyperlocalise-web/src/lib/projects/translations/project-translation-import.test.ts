import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { insertMock, limitMock, onConflictDoUpdateMock, selectMock, valuesMock, whereMock } =
  vi.hoisted(() => {
    const onConflictDoUpdateMock = vi.fn(() => undefined);
    const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
    const insertMock = vi.fn(() => ({ values: valuesMock }));
    const limitMock = vi.fn(async (): Promise<unknown[]> => []);
    const whereMock = vi.fn(() => ({ limit: limitMock }));
    const fromMock = vi.fn(() => ({ where: whereMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));

    return {
      insertMock,
      limitMock,
      onConflictDoUpdateMock,
      selectMock,
      valuesMock,
      whereMock,
    };
  });

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join(""),
      values,
    })),
    { raw: vi.fn((value: string) => ({ raw: value })) },
  ),
}));

vi.mock("@/lib/database", () => ({
  db: {
    insert: insertMock,
    select: selectMock,
  },
  schema: {
    repositorySourceFiles: {
      id: "id",
      organizationId: "organizationId",
      projectId: "projectId",
      sourcePath: "sourcePath",
    },
    projectTranslationKeys: {
      id: "id",
      key: "key",
      projectId: "projectId",
      repositorySourceFileId: "repositorySourceFileId",
    },
    projectTranslations: {
      translationKeyId: "translationKeyId",
      targetLocale: "targetLocale",
    },
  },
}));

import { importApprovedProjectTranslationsFromEntries } from "./project-translation-service";

describe("importApprovedTranslationsFromEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([]);
  });

  it("imports matched keys as approved translations with import provenance", async () => {
    whereMock
      .mockImplementationOnce(() => ({ limit: limitMock }))
      .mockImplementationOnce(
        () =>
          Promise.resolve([{ id: "key_1", key: "greeting" }]) as unknown as {
            limit: typeof limitMock;
          },
      );
    limitMock.mockResolvedValueOnce([{ id: "repo_file_1" }]);

    const result = await importApprovedProjectTranslationsFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      entries: { greeting: "Bonjour", missing: "Inconnu" },
      actorUserId: "user_1",
    });

    expect(result).toEqual({ matched: 1, imported: 1, skipped: 1 });

    expect(valuesMock).toHaveBeenCalledWith([
      expect.objectContaining({
        translationKeyId: "key_1",
        targetLocale: "fr",
        text: "Bonjour",
        status: "approved",
        provenance: "import",
        reviewedByUserId: "user_1",
      }),
    ]);

    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          text: expect.objectContaining({ sql: "excluded.text" }),
          status: expect.objectContaining({ sql: "excluded.status" }),
          provenance: expect.objectContaining({ sql: "excluded.provenance" }),
        }),
      }),
    );
  });

  it("skips everything when the source file is not found", async () => {
    limitMock.mockResolvedValueOnce([]);

    const result = await importApprovedProjectTranslationsFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      entries: { greeting: "Bonjour" },
    });

    expect(result).toEqual({ matched: 0, imported: 0, skipped: 1 });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns zero counts for empty input without touching the database", async () => {
    const result = await importApprovedProjectTranslationsFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      entries: {},
    });

    expect(result).toEqual({ matched: 0, imported: 0, skipped: 0 });
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
