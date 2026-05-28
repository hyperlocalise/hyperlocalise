import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHash } from "node:crypto";

type UpsertedMemoryEntry = {
  externalKey: string;
  memoryId: string;
  metadata: { segmentKey: string };
  normalizedSourceText: string;
  sourceText: string;
  targetText: string;
};

type ReusableMemoryEntryRow = {
  memoryId: string;
  metadata?: {
    segmentKey: string;
    sourceTextHash: string;
  };
  normalizedSourceText?: string;
  targetLocale?: string;
  targetText?: string;
};

const {
  andMock,
  eqMock,
  inArrayMock,
  insertMock,
  onConflictDoUpdateMock,
  selectMock,
  sqlMock,
  valuesMock,
  whereMock,
} = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn(async () => undefined);
  const valuesMock = vi.fn((_values: UpsertedMemoryEntry[]) => ({
    onConflictDoUpdate: onConflictDoUpdateMock,
  }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const whereMock = vi.fn(
    async (): Promise<ReusableMemoryEntryRow[]> => [
      { memoryId: "memory_1" },
      { memoryId: "memory_2" },
    ],
  );
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return {
    andMock: vi.fn((...conditions: unknown[]) => ["and", conditions]),
    eqMock: vi.fn((field: string, value: unknown) => ["eq", field, value]),
    inArrayMock: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
    insertMock,
    onConflictDoUpdateMock,
    selectMock,
    sqlMock: vi.fn((strings: TemplateStringsArray) => ({ sql: strings.join("") })),
    valuesMock,
    whereMock,
  };
});

vi.mock("drizzle-orm", () => ({
  and: andMock,
  eq: eqMock,
  inArray: inArrayMock,
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
      reviewStatus: "reviewStatus",
      sourceLocale: "sourceLocale",
      sourceText: "sourceText",
      targetLocale: "targetLocale",
      targetText: "targetText",
    },
    projectMemories: {
      memoryId: "memoryId",
      projectId: "projectId",
    },
  },
}));

import {
  persistFileTranslationMemoryEntries,
  reuseFileTranslationMemoryEntries,
} from "./file-translation-memory";

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

    expect(valuesMock).toHaveBeenCalledOnce();

    const [values] = valuesMock.mock.calls[0];

    expect(values).toHaveLength(4);
    expect(values.map((value) => `${value.memoryId}:${value.normalizedSourceText}`)).toEqual([
      "memory_1:hello world",
      "memory_2:hello world",
      "memory_1:goodbye",
      "memory_2:goodbye",
    ]);
    expect(
      values.find(
        (value) => value.memoryId === "memory_1" && value.normalizedSourceText === "hello world",
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

    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ updatedAt: { sql: "now()" } }),
      }),
    );
  });
});

describe("reuseFileTranslationMemoryEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes reusable memory entry lookup to the project's attached memories", async () => {
    whereMock
      .mockResolvedValueOnce([{ memoryId: "memory_1" }, { memoryId: "memory_2" }])
      .mockResolvedValueOnce([]);

    await reuseFileTranslationMemoryEntries({
      projectId: "project_1",
      sourceEntries: { first: "Hello" },
      sourceLocale: "en",
      targetLocale: "fr",
    });

    expect(inArrayMock).toHaveBeenCalledWith("memoryId", ["memory_1", "memory_2"]);
    expect(inArrayMock).toHaveBeenCalledWith("normalizedSourceText", ["hello"]);
    expect(andMock).toHaveBeenCalledWith(
      ["eq", "sourceLocale", "en"],
      ["eq", "targetLocale", "fr"],
      ["eq", "reviewStatus", "approved"],
      ["inArray", "memoryId", ["memory_1", "memory_2"]],
      ["inArray", "normalizedSourceText", ["hello"]],
    );
  });

  it("reuses only rows that match the target locale, segment key, and source hash", async () => {
    whereMock
      .mockResolvedValueOnce([{ memoryId: "memory_1" }, { memoryId: "memory_2" }])
      .mockResolvedValueOnce([
        {
          memoryId: "memory_1",
          metadata: {
            segmentKey: "first",
            sourceTextHash: createHash("sha256").update("Hello", "utf8").digest("hex"),
          },
          normalizedSourceText: "hello",
          targetLocale: "fr",
          targetText: "Bonjour",
        },
        {
          memoryId: "memory_2",
          metadata: {
            segmentKey: "first",
            sourceTextHash: createHash("sha256").update("Hello", "utf8").digest("hex"),
          },
          normalizedSourceText: "hello",
          targetLocale: "de",
          targetText: "Hallo",
        },
      ]);

    const result = await reuseFileTranslationMemoryEntries({
      projectId: "project_1",
      sourceEntries: { first: "Hello", second: "Hello" },
      sourceLocale: "en",
      targetLocale: "fr",
    });

    expect(result).toEqual({ first: "Bonjour" });
  });
});
