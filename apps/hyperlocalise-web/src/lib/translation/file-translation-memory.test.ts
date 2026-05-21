import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  eqMock,
  fromMock,
  insertMock,
  onConflictDoUpdateMock,
  selectMock,
  sqlMock,
  valuesMock,
  whereMock,
} = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn(async () => undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const whereMock = vi.fn(async () => [{ memoryId: "memory_1" }, { memoryId: "memory_2" }]);
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return {
    eqMock: vi.fn(() => "project filter"),
    fromMock,
    insertMock,
    onConflictDoUpdateMock,
    selectMock,
    sqlMock: vi.fn((strings: TemplateStringsArray) => ({ sql: strings.join("") })),
    valuesMock,
    whereMock,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
  sql: sqlMock,
}));

vi.mock("@/lib/database", () => ({
  db: {
    insert: insertMock,
    select: selectMock,
  },
  schema: {
    memoryEntries: {
      externalKey: "externalKey",
      memoryId: "memoryId",
      metadata: "metadata",
      normalizedSourceText: "normalizedSourceText",
      provenance: "provenance",
      sourceLocale: "sourceLocale",
      targetLocale: "targetLocale",
      targetText: "targetText",
    },
    projectMemories: {
      memoryId: "memoryId",
      projectId: "projectId",
    },
  },
}));

import { persistFileTranslationMemoryEntries } from "./file-translation-memory";

describe("persistFileTranslationMemoryEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dedupes duplicate normalized sources before batch upsert", async () => {
    await persistFileTranslationMemoryEntries({
      jobId: "job_1",
      projectId: "project_1",
      sourceEntries: {
        first: "Hello World",
        second: " hello   world ",
        third: "Goodbye",
      },
      sourceFileHash: "hash_1",
      sourceLocale: "en",
      sourcePath: "locales/en.json",
      targetEntries: {
        first: "Bonjour le monde",
        second: "Salut le monde",
        third: "Au revoir",
      },
      targetLocale: "fr",
    });

    const values = valuesMock.mock.calls[0]?.[0];

    expect(values).toHaveLength(4);
    expect(
      values.map(
        (value: { memoryId: string; normalizedSourceText: string }) =>
          `${value.memoryId}:${value.normalizedSourceText}`,
      ),
    ).toEqual([
      "memory_1:hello world",
      "memory_2:hello world",
      "memory_1:goodbye",
      "memory_2:goodbye",
    ]);
    expect(
      values.find(
        (value: { memoryId: string; normalizedSourceText: string }) =>
          value.memoryId === "memory_1" && value.normalizedSourceText === "hello world",
      ),
    ).toMatchObject({
      externalKey: "job_1:fr:second",
      metadata: { segmentKey: "second" },
      sourceText: " hello   world ",
      targetText: "Salut le monde",
    });
  });

  it("uses the database clock for conflict update timestamps", async () => {
    await persistFileTranslationMemoryEntries({
      jobId: "job_1",
      projectId: "project_1",
      sourceEntries: { first: "Hello" },
      sourceFileHash: "hash_1",
      sourceLocale: "en",
      sourcePath: "locales/en.json",
      targetEntries: { first: "Bonjour" },
      targetLocale: "fr",
    });

    expect(onConflictDoUpdateMock.mock.calls[0]?.[0].set.updatedAt).toEqual({ sql: "now()" });
  });
});
