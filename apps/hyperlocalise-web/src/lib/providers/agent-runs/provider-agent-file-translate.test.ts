import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ExternalTmsTaskContent } from "@/lib/providers/tms-provider-types";

import {
  shouldUseProviderFileTranslation,
  summarizeProviderUnitFileIds,
  translateProviderJobFiles,
} from "./provider-agent-file-translate";

const mocks = vi.hoisted(() => {
  const glossaryLimitMock = vi.fn(async () => []);
  const glossaryQuery = {} as {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
  glossaryQuery.from = vi.fn(() => glossaryQuery);
  glossaryQuery.innerJoin = vi.fn(() => glossaryQuery);
  glossaryQuery.where = vi.fn(() => glossaryQuery);
  glossaryQuery.orderBy = vi.fn(() => ({ limit: glossaryLimitMock }));
  glossaryQuery.limit = glossaryLimitMock;

  return {
    dbSelectMock: vi.fn(() => glossaryQuery),
    downloadProviderSourceFileMock: vi.fn(),
    glossaryLimitMock,
    loadTranslationContextProjectMock: vi.fn(),
    reuseFileTranslationMemoryEntriesMock: vi.fn(),
    buildTempConfigMock: vi.fn(() => "locales: []"),
    createTranslationSandboxMock: vi.fn(),
    getSandboxTranslationEnvMock: vi.fn(() => ({})),
    prepareSandboxMock: vi.fn(async () => undefined),
    readTranslatedFileMock: vi.fn(async () => Buffer.from("translated file", "utf8")),
    runSandboxCommandMock: vi.fn(),
    stopTranslationSandboxMock: vi.fn(async () => undefined),
    writeFileToSandboxMock: vi.fn(async () => undefined),
    writeTempConfigMock: vi.fn(async () => undefined),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: mocks.dbSelectMock,
  },
  schema: {
    glossaries: {
      id: "glossaries.id",
      sourceLocale: "glossaries.sourceLocale",
      targetLocale: "glossaries.targetLocale",
      status: "glossaries.status",
    },
    glossaryTerms: {
      glossaryId: "glossaryTerms.glossaryId",
      sourceTerm: "glossaryTerms.sourceTerm",
      targetTerm: "glossaryTerms.targetTerm",
      description: "glossaryTerms.description",
      forbidden: "glossaryTerms.forbidden",
      caseSensitive: "glossaryTerms.caseSensitive",
      reviewStatus: "glossaryTerms.reviewStatus",
    },
    projectGlossaries: {
      glossaryId: "projectGlossaries.glossaryId",
      projectId: "projectGlossaries.projectId",
      priority: "projectGlossaries.priority",
    },
  },
}));

vi.mock("@/lib/providers/download-provider-source-file", () => ({
  downloadProviderSourceFile: (...args: unknown[]) =>
    mocks.downloadProviderSourceFileMock(...args),
}));

vi.mock("@/lib/translation/assemble-translation-context", () => ({
  loadTranslationContextProject: (...args: unknown[]) =>
    mocks.loadTranslationContextProjectMock(...args),
}));

vi.mock("@/lib/translation/file-translation-memory", () => ({
  reuseFileTranslationMemoryEntries: (...args: unknown[]) =>
    mocks.reuseFileTranslationMemoryEntriesMock(...args),
}));

vi.mock("@/lib/translation/sandbox-translation", () => ({
  buildTempConfig: (...args: unknown[]) => mocks.buildTempConfigMock(...args),
  createTranslationSandbox: (...args: unknown[]) =>
    mocks.createTranslationSandboxMock(...args),
  getSandboxTranslationEnv: (...args: unknown[]) =>
    mocks.getSandboxTranslationEnvMock(...args),
  prepareSandbox: (...args: unknown[]) => mocks.prepareSandboxMock(...args),
  readTranslatedFile: (...args: unknown[]) => mocks.readTranslatedFileMock(...args),
  runSandboxCommand: (...args: unknown[]) => mocks.runSandboxCommandMock(...args),
  stopTranslationSandbox: (...args: unknown[]) => mocks.stopTranslationSandboxMock(...args),
  writeFileToSandbox: (...args: unknown[]) => mocks.writeFileToSandboxMock(...args),
  writeTempConfig: (...args: unknown[]) => mocks.writeTempConfigMock(...args),
}));

function createContent(): ExternalTmsTaskContent {
  return {
    externalJobId: "job-1",
    sourceLocale: "en",
    targetLocales: ["fr"],
    units: [
      {
        externalStringId: "unit-1",
        key: "hello",
        sourceText: "Hello",
        fileId: "file-1",
        translations: [],
      },
      {
        externalStringId: "unit-2",
        key: "world",
        sourceText: "World",
        fileId: "file-1",
        translations: [{ locale: "fr", text: "Monde", isApproved: true }],
      },
      {
        externalStringId: "unit-3",
        key: "orphan",
        sourceText: "Orphan",
        fileId: "missing-file",
        translations: [],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  let sandboxCounter = 0;
  mocks.createTranslationSandboxMock.mockImplementation(async () => ({
    sandboxId: `sandbox-${++sandboxCounter}`,
  }));
  mocks.downloadProviderSourceFileMock.mockResolvedValue({
    ok: true,
    content: Buffer.from('{"hello":"Hello","world":"World"}', "utf8"),
    filename: "messages.json",
    fileFormat: "json",
  });
  mocks.glossaryLimitMock.mockResolvedValue([]);
  mocks.loadTranslationContextProjectMock.mockResolvedValue({
    name: "Website",
    translationContext: "Friendly marketing copy",
  });
  mocks.reuseFileTranslationMemoryEntriesMock.mockResolvedValue({
    hello: "Salut TM",
  });
  mocks.runSandboxCommandMock.mockImplementation(async (_sandboxId, _command, args: string[]) => {
    const script = args[2] ?? "";
    if (script.includes("hl run")) {
      return { exitCode: 0, output: "translated" };
    }
    if (script.includes("messages-fr.json")) {
      return {
        exitCode: 0,
        output: JSON.stringify({ hello: "Bonjour", world: "Monde" }),
      };
    }
    if (script.includes("hl entries")) {
      return {
        exitCode: 0,
        output: JSON.stringify({ hello: "Hello", world: "World" }),
      };
    }
    return { exitCode: 0, output: "" };
  });
});

describe("provider agent file translation helpers", () => {
  it("uses file translation only when a source file has a non-empty source path", () => {
    expect(
      shouldUseProviderFileTranslation({
        sourceFiles: [
          { id: "1", displayName: "no-path.json", sourcePath: null },
          { id: "2", displayName: "blank.json", sourcePath: "   " },
        ],
      }),
    ).toBe(false);

    expect(
      shouldUseProviderFileTranslation({
        sourceFiles: [
          { id: "1", displayName: "no-path.json", sourcePath: null },
          { id: "2", displayName: "messages.json", sourcePath: "strings/messages.json" },
        ],
      }),
    ).toBe(true);
  });

  it("summarizes missing and blank unit file ids in the null bucket", () => {
    expect(
      summarizeProviderUnitFileIds([
        { externalStringId: "1", key: "a", sourceText: "A", fileId: "file-1", translations: [] },
        { externalStringId: "2", key: "b", sourceText: "B", fileId: null, translations: [] },
        { externalStringId: "3", key: "c", sourceText: "C", fileId: "", translations: [] },
        { externalStringId: "4", key: "d", sourceText: "D", translations: [] },
        { externalStringId: "5", key: "e", sourceText: "E", fileId: "file-1", translations: [] },
      ]),
    ).toEqual({
      "file-1": 2,
      "(null)": 3,
    });
  });
});

describe("translateProviderJobFiles", () => {
  it("downloads matching source files, preserves prefilled entries, and proposes only missing translations", async () => {
    const result = await translateProviderJobFiles({
      agentRunId: "run-1",
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      content: createContent(),
      sourceFiles: [
        { id: "no-source", displayName: "no-source.json", sourcePath: null },
        { id: "file-2", displayName: "other.json", sourcePath: "strings/other.json" },
        { id: "file-1", displayName: "messages.json", sourcePath: "strings/messages.json" },
      ],
      actorUserId: "user-1",
    });

    expect(mocks.downloadProviderSourceFileMock).toHaveBeenCalledTimes(1);
    expect(mocks.downloadProviderSourceFileMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      externalFileId: "file-1",
      sourcePath: "strings/messages.json",
      actorUserId: "user-1",
    });
    expect(mocks.reuseFileTranslationMemoryEntriesMock).toHaveBeenCalledWith({
      projectId: "project-1",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceEntries: { hello: "Hello", world: "World" },
    });

    const prefilledCall = mocks.writeFileToSandboxMock.mock.calls.find(([, path]) =>
      String(path).includes("prefilled"),
    );
    expect(prefilledCall).toBeDefined();
    expect(JSON.parse(prefilledCall![2].toString("utf8"))).toEqual({
      hello: "Salut TM",
      world: "Monde",
    });

    expect(result).toMatchObject({
      filesProcessed: 1,
      unitsProcessed: 1,
      skippedExistingLocales: 1,
      warnings: [],
    });
    expect(result.changedItems).toEqual([
      expect.objectContaining({
        itemId: "unit-1:fr",
        externalStringId: "unit-1",
        key: "hello",
        locale: "fr",
        sourceText: "Hello",
        from: "",
        to: "Bonjour",
        reviewState: "pending",
        changedFields: ["target"],
      }),
    ]);
    expect(
      mocks.runSandboxCommandMock.mock.calls.some(([, , args]) =>
        String(args[2]).includes("--prefilled-entries"),
      ),
    ).toBe(true);
  });

  it("returns a warning and avoids sandbox work when source file download fails", async () => {
    mocks.downloadProviderSourceFileMock.mockResolvedValue({
      ok: false,
      code: "provider_auth_invalid",
      message: "Provider credentials are invalid",
    });

    const result = await translateProviderJobFiles({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "crowdin",
      content: createContent(),
      sourceFiles: [
        { id: "file-1", displayName: "messages.json", sourcePath: "strings/messages.json" },
      ],
    });

    expect(result).toEqual({
      changedItems: [],
      warnings: ["Skipped file messages.json: Provider credentials are invalid"],
      unitsProcessed: 0,
      skippedExistingLocales: 0,
      filesProcessed: 0,
    });
    expect(mocks.createTranslationSandboxMock).not.toHaveBeenCalled();
    expect(mocks.reuseFileTranslationMemoryEntriesMock).not.toHaveBeenCalled();
  });
});
