import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  deleteMock,
  deleteReturningMock,
  insertMock,
  limitMock,
  orderByMock,
  selectMock,
  whereMock,
} = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn(async () => undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const deleteReturningMock = vi.fn(async (): Promise<unknown[]> => []);
  const deleteWhereMock = vi.fn(() => ({ returning: deleteReturningMock }));
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));
  const limitMock = vi.fn(async (): Promise<unknown[]> => []);
  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => {
    const rowsPromise = Promise.resolve([] as unknown[]);
    return Object.assign(rowsPromise, {
      limit: limitMock,
      orderBy: orderByMock,
    });
  });
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return {
    deleteMock,
    deleteReturningMock,
    insertMock,
    limitMock,
    orderByMock,
    selectMock,
    whereMock,
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  asc: vi.fn((field: unknown) => ["asc", field]),
  count: vi.fn(() => ({ count: "count" })),
  desc: vi.fn((field: unknown) => ["desc", field]),
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
    repositorySourceFileVersions: {
      id: "id",
      repositorySourceFileId: "repositorySourceFileId",
      createdAt: "createdAt",
      ingestState: "ingestState",
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
    whereMock.mockImplementation(() => {
      const rowsPromise = Promise.resolve([] as unknown[]);
      return Object.assign(rowsPromise, {
        limit: limitMock,
        orderBy: orderByMock,
      });
    });
    limitMock.mockResolvedValue([]);
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
    whereMock.mockImplementationOnce(() => {
      const rowsPromise = Promise.resolve([{ key: "greeting" }]);
      return Object.assign(rowsPromise, { limit: limitMock, orderBy: orderByMock });
    });
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

  it("skips prune when a newer source file version is already ingesting or ingested", async () => {
    whereMock.mockImplementationOnce(() => {
      const rowsPromise = Promise.resolve([{ key: "greeting" }]);
      return Object.assign(rowsPromise, { limit: limitMock, orderBy: orderByMock });
    });
    limitMock.mockResolvedValueOnce([{ id: "version_newer" }]);

    const result = await upsertProjectTranslationKeysFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      repositorySourceFileId: "file_1",
      sourceFileVersionId: "version_older",
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    expect(result).toEqual({
      imported: 0,
      updated: 1,
      deleted: 0,
      truncated: false,
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("skips prune when another active version ties on createdAt but wins the id tie-breaker", async () => {
    whereMock.mockImplementationOnce(() => {
      const rowsPromise = Promise.resolve([{ key: "greeting" }]);
      return Object.assign(rowsPromise, { limit: limitMock, orderBy: orderByMock });
    });
    limitMock.mockResolvedValueOnce([{ id: "version_b" }]);

    const result = await upsertProjectTranslationKeysFromEntries({
      organizationId: "org_1",
      projectId: "project_1",
      repositorySourceFileId: "file_1",
      sourceFileVersionId: "version_a",
      entries: [{ key: "greeting", text: "Hello", context: null }],
    });

    expect(result).toEqual({
      imported: 0,
      updated: 1,
      deleted: 0,
      truncated: false,
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
