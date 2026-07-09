import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { deleteMock, deleteReturningMock, insertMock, selectMock, whereMock } = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn(async () => undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const deleteReturningMock = vi.fn(async (): Promise<unknown[]> => []);
  const deleteWhereMock = vi.fn(() => ({ returning: deleteReturningMock }));
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));
  const whereMock = vi.fn(async (): Promise<unknown[]> => []);
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return {
    deleteMock,
    deleteReturningMock,
    insertMock,
    selectMock,
    whereMock,
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  asc: vi.fn((field: unknown) => ["asc", field]),
  count: vi.fn(() => ({ count: "count" })),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  ilike: vi.fn((field: string, value: unknown) => ["ilike", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  notInArray: vi.fn((field: string, values: unknown[]) => ["notInArray", field, values]),
  or: vi.fn((...conditions: unknown[]) => ["or", conditions]),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray) => ({
      sql: strings.join(""),
    })),
    { raw: vi.fn((value: string) => ({ raw: value })) },
  ),
}));

vi.mock("@/lib/database", () => ({
  db: {
    delete: deleteMock,
    insert: insertMock,
    select: selectMock,
  },
  schema: {
    projectTranslationKeys: {
      id: "id",
      key: "key",
      organizationId: "organizationId",
      projectId: "projectId",
      repositorySourceFileId: "repositorySourceFileId",
      sourceText: "sourceText",
      normalizedSourceText: "normalizedSourceText",
      context: "context",
      type: "type",
      sourceFileVersionId: "sourceFileVersionId",
      updatedAt: "updatedAt",
    },
  },
}));

vi.mock("@/lib/translation/normalizeTranslationMemorySourceText", () => ({
  normalizeTranslationMemorySourceText: (text: string) => text.trim().toLowerCase(),
}));

import { upsertProjectTranslationKeysFromEntries } from "./project-translation-service";

describe("upsertProjectTranslationKeysFromEntries truncation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockResolvedValue([]);
    deleteReturningMock.mockResolvedValue([]);
  });

  it("skips prune when more than 5,000 keys are provided", async () => {
    const entries = Array.from({ length: 5_001 }, (_, index) => ({
      key: `key_${index}`,
      text: `Text ${index}`,
      context: null,
    }));

    const result = await upsertProjectTranslationKeysFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      repositorySourceFileId: "file_1",
      entries,
    });

    expect(result).toEqual({
      imported: 5_000,
      updated: 0,
      deleted: 0,
      truncated: true,
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("prunes missing keys when the entry list is within the import cap", async () => {
    whereMock.mockResolvedValueOnce([{ key: "greeting" }]);
    deleteReturningMock.mockResolvedValueOnce([{ id: "deleted_1" }]);

    const result = await upsertProjectTranslationKeysFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      repositorySourceFileId: "file_1",
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    expect(result).toEqual({
      imported: 0,
      updated: 1,
      deleted: 1,
      truncated: false,
    });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteReturningMock).toHaveBeenCalledTimes(1);
  });

  it("deletes all keys when the entry list is empty", async () => {
    deleteReturningMock.mockResolvedValueOnce([{ id: "deleted_1" }, { id: "deleted_2" }]);

    const result = await upsertProjectTranslationKeysFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      repositorySourceFileId: "file_1",
      entries: [],
    });

    expect(result).toEqual({
      imported: 0,
      updated: 0,
      deleted: 2,
      truncated: false,
    });
    expect(insertMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
