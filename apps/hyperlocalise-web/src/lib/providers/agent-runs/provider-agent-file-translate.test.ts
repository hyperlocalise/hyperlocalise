/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  process.env.CI = "true";
});

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-api-key",
    FILE_STORAGE_PROVIDER: "vercel_blob",
    FILE_STORAGE_ACCESS: "private",
  },
}));

const loadTranslationContextProjectMock = vi.fn();
const loadProviderCrowdinDownloadContextMock = vi.fn();
const resolveProviderSourceFileDownloadMock = vi.fn();
const reuseFileTranslationMemoryEntriesMock = vi.fn();

const createTranslationSandboxMock = vi.fn();
const prepareSandboxMock = vi.fn();
const stopTranslationSandboxMock = vi.fn();
const downloadAttachmentMock = vi.fn();
const downloadCrowdinSourceInSandboxMock = vi.fn();
const downloadCrowdinTranslationsInSandboxMock = vi.fn();
const extractSandboxEntriesMock = vi.fn();
const readTranslatedFileMock = vi.fn();
const buildMultiFileMultiLocaleTempConfigMock = vi.fn();
const buildCrowdinMultiFileSandboxConfigMock = vi.fn();
const writeTempConfigMock = vi.fn();
const writeFileToSandboxMock = vi.fn();
const runSandboxCommandMock = vi.fn();
const getSandboxTranslationEnvMock = vi.fn();
const getOutputFilenameMock = vi.fn();
const getOutputFilenamePatternMock = vi.fn();

vi.mock("@/lib/translation/context", () => ({
  loadTranslationContextProject: (...args: unknown[]) => loadTranslationContextProjectMock(...args),
}));

vi.mock("@/lib/providers/jobs/download-provider-source-file", () => ({
  loadProviderCrowdinDownloadContext: (...args: unknown[]) =>
    loadProviderCrowdinDownloadContextMock(...args),
  resolveProviderSourceFileDownload: (...args: unknown[]) =>
    resolveProviderSourceFileDownloadMock(...args),
}));

vi.mock("@/lib/translation/file-memory", () => ({
  reuseFileTranslationMemoryEntries: (...args: unknown[]) =>
    reuseFileTranslationMemoryEntriesMock(...args),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [],
              }),
            }),
          }),
        }),
      }),
    }),
  },
  schema: {
    glossaryTerms: {
      sourceTerm: "sourceTerm",
      targetTerm: "targetTerm",
      description: "description",
      forbidden: "forbidden",
      caseSensitive: "caseSensitive",
      glossaryId: "glossaryId",
      reviewStatus: "reviewStatus",
    },
    glossaries: {
      id: "id",
      targetLocale: "targetLocale",
      sourceLocale: "sourceLocale",
      status: "status",
    },
    projectGlossaries: {
      projectId: "projectId",
      glossaryId: "glossaryId",
      priority: "priority",
    },
  },
}));

vi.mock("@/lib/translation/sandbox", () => ({
  createTranslationSandbox: (...args: unknown[]) => createTranslationSandboxMock(...args),
  prepareSandbox: (...args: unknown[]) => prepareSandboxMock(...args),
  stopTranslationSandbox: (...args: unknown[]) => stopTranslationSandboxMock(...args),
  downloadAttachment: (...args: unknown[]) => downloadAttachmentMock(...args),
  downloadCrowdinSourceInSandbox: (...args: unknown[]) =>
    downloadCrowdinSourceInSandboxMock(...args),
  downloadCrowdinTranslationsInSandbox: (...args: unknown[]) =>
    downloadCrowdinTranslationsInSandboxMock(...args),
  extractSandboxEntries: (...args: unknown[]) => extractSandboxEntriesMock(...args),
  readTranslatedFile: (...args: unknown[]) => readTranslatedFileMock(...args),
  buildMultiFileMultiLocaleTempConfig: (...args: unknown[]) =>
    buildMultiFileMultiLocaleTempConfigMock(...args),
  buildCrowdinMultiFileSandboxConfig: (...args: unknown[]) =>
    buildCrowdinMultiFileSandboxConfigMock(...args),
  writeTempConfig: (...args: unknown[]) => writeTempConfigMock(...args),
  writeFileToSandbox: (...args: unknown[]) => writeFileToSandboxMock(...args),
  runSandboxCommand: (...args: unknown[]) => runSandboxCommandMock(...args),
  getSandboxTranslationEnv: (...args: unknown[]) => getSandboxTranslationEnvMock(...args),
  getOutputFilename: (...args: unknown[]) => getOutputFilenameMock(...args),
  getOutputFilenamePattern: (...args: unknown[]) => getOutputFilenamePatternMock(...args),
  sandboxI18nConfigPath: ".hl-sandbox-i18n.yml",
}));

import {
  isProviderFileFullyTranslated,
  mergeLocaleKeyedPrefills,
  translateProviderJobFiles,
} from "./provider-agent-file-translate";

describe("isProviderFileFullyTranslated", () => {
  it("returns true when every unit has a translation for every locale", () => {
    expect(
      isProviderFileFullyTranslated({
        targetLocales: ["fr", "de"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-1",
            translations: [
              { locale: "fr", text: "Bonjour" },
              { locale: "de", text: "Hallo" },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns false when any unit/locale is missing a translation", () => {
    expect(
      isProviderFileFullyTranslated({
        targetLocales: ["fr", "de"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-1",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("treats blank translations as missing", () => {
    expect(
      isProviderFileFullyTranslated({
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-1",
            translations: [{ locale: "fr", text: "   " }],
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("mergeLocaleKeyedPrefills", () => {
  it("keeps prefills for keys owned by a single file", () => {
    expect(
      mergeLocaleKeyedPrefills([
        { entryKeys: ["hello"], prefillsByLocale: { fr: { hello: "Bonjour" } } },
        { entryKeys: ["bye"], prefillsByLocale: { fr: { bye: "Au revoir" } } },
      ]),
    ).toEqual({
      fr: { hello: "Bonjour", bye: "Au revoir" },
    });
  });

  it("drops keys shared by more than one file even when the values agree", () => {
    expect(
      mergeLocaleKeyedPrefills([
        {
          entryKeys: ["hello", "save"],
          prefillsByLocale: { fr: { hello: "Bonjour", save: "Enregistrer" } },
        },
        {
          entryKeys: ["hello", "save"],
          prefillsByLocale: { fr: { hello: "Bonjour", save: "Sauver" } },
        },
      ]),
    ).toEqual({
      fr: {},
    });
  });

  it("drops a key another file owns even when only one file has a prefill for it", () => {
    expect(
      mergeLocaleKeyedPrefills([
        { entryKeys: ["title"], prefillsByLocale: { fr: { title: "Titre" } } },
        { entryKeys: ["title"], prefillsByLocale: { fr: {} } },
      ]),
    ).toEqual({
      fr: {},
    });
  });
});

describe("translateProviderJobFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTranslationContextProjectMock.mockResolvedValue({
      name: "Demo",
      translationContext: "App UI",
    });
    loadProviderCrowdinDownloadContextMock.mockResolvedValue({
      ok: true,
      externalProjectId: "123",
      secretMaterial: "secret",
      baseUrl: null,
    });
    resolveProviderSourceFileDownloadMock.mockResolvedValue({
      ok: true,
      downloadUrl: "https://example.com/file.json",
      filename: "messages.json",
      fileFormat: "json",
    });
    reuseFileTranslationMemoryEntriesMock.mockResolvedValue({});
    createTranslationSandboxMock.mockResolvedValue({ sandboxId: "sandbox_shared" });
    prepareSandboxMock.mockResolvedValue(undefined);
    stopTranslationSandboxMock.mockResolvedValue(undefined);
    downloadAttachmentMock.mockResolvedValue(undefined);
    downloadCrowdinSourceInSandboxMock.mockResolvedValue({ ok: true });
    downloadCrowdinTranslationsInSandboxMock.mockResolvedValue({ ok: false });
    buildCrowdinMultiFileSandboxConfigMock.mockReturnValue("crowdin-config");
    buildMultiFileMultiLocaleTempConfigMock.mockReturnValue("i18n-config");
    writeTempConfigMock.mockResolvedValue(undefined);
    writeFileToSandboxMock.mockResolvedValue(undefined);
    getSandboxTranslationEnvMock.mockReturnValue({});
    runSandboxCommandMock.mockResolvedValue({ exitCode: 0, output: "" });
    getOutputFilenamePatternMock.mockImplementation(
      (filename: string) => `${filename.replace(/\.json$/, "")}-{{target}}.json`,
    );
    getOutputFilenameMock.mockImplementation(
      (filename: string, locale: string) => `${filename.replace(/\.json$/, "")}-${locale}.json`,
    );
    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path.includes("file-1") && path.includes("-fr")) {
        return Buffer.from('{"hello":"Bonjour"}', "utf8");
      }
      if (path.includes("file-2") && path.includes("-fr")) {
        return Buffer.from('{"bye":"Au revoir"}', "utf8");
      }
      if (path.includes("file-pending") && path.includes("-fr")) {
        return Buffer.from('{"bye":"Au revoir"}', "utf8");
      }
      if (path.includes("file-1")) {
        return Buffer.from('{"hello":"Hello"}', "utf8");
      }
      if (path.includes("file-2") || path.includes("file-pending")) {
        return Buffer.from('{"bye":"Goodbye"}', "utf8");
      }
      return Buffer.from("{}", "utf8");
    });
    extractSandboxEntriesMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path.includes("file-1") && path.includes("-fr")) {
        return { ok: true, entries: { hello: "Bonjour" } };
      }
      if ((path.includes("file-2") || path.includes("file-pending")) && path.includes("-fr")) {
        return { ok: true, entries: { bye: "Au revoir" } };
      }
      if (path.includes("file-1")) {
        return { ok: true, entries: { hello: "Hello" } };
      }
      if (path.includes("file-2") || path.includes("file-pending")) {
        return { ok: true, entries: { bye: "Goodbye" } };
      }
      return { ok: true, entries: {} };
    });
  });

  it("skips sandbox creation when every source file is already fully translated", async () => {
    const result = await translateProviderJobFiles({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "crowdin",
      sourceFiles: [
        {
          id: "file-1",
          displayName: "messages.json",
          sourcePath: "locales/messages.json",
        },
      ],
      content: {
        externalJobId: "task-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-1",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      },
    });

    expect(result).toMatchObject({
      filesProcessed: 0,
      unitsProcessed: 0,
      skippedExistingLocales: 1,
      changedItems: [],
    });
    expect(createTranslationSandboxMock).not.toHaveBeenCalled();
    expect(stopTranslationSandboxMock).not.toHaveBeenCalled();
  });

  it("runs one multi-file hl config for multiple pending files", async () => {
    const result = await translateProviderJobFiles({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "crowdin",
      sourceFiles: [
        {
          id: "file-1",
          displayName: "a.json",
          sourcePath: "locales/a.json",
        },
        {
          id: "file-2",
          displayName: "b.json",
          sourcePath: "locales/b.json",
        },
      ],
      content: {
        externalJobId: "task-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-1",
            translations: [],
          },
          {
            externalStringId: "2",
            key: "bye",
            sourceText: "Goodbye",
            fileId: "file-2",
            translations: [],
          },
        ],
      },
    });

    expect(createTranslationSandboxMock).toHaveBeenCalledTimes(1);
    expect(prepareSandboxMock).toHaveBeenCalledTimes(1);
    expect(stopTranslationSandboxMock).toHaveBeenCalledTimes(1);
    expect(buildMultiFileMultiLocaleTempConfigMock).toHaveBeenCalledTimes(1);
    expect(buildMultiFileMultiLocaleTempConfigMock).toHaveBeenCalledWith(
      [
        {
          from: "work_file-1_a.json",
          to: "work_file-1_a-{{target}}.json",
        },
        {
          from: "work_file-2_b.json",
          to: "work_file-2_b-{{target}}.json",
        },
      ],
      "en",
      ["fr"],
      null,
      expect.objectContaining({ projectName: "Demo" }),
    );
    expect(runSandboxCommandMock).toHaveBeenCalledTimes(1);
    expect(result.filesProcessed).toBe(2);
    expect(result.unitsProcessed).toBe(2);
    expect(result.changedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "hello", to: "Bonjour" }),
        expect.objectContaining({ key: "bye", to: "Au revoir" }),
      ]),
    );
  });

  it("preserves readable outputs when the multi-file hl run reports a partial failure", async () => {
    runSandboxCommandMock.mockResolvedValue({
      exitCode: 1,
      output: "run completed with failures: 1",
    });
    readTranslatedFileMock.mockImplementation(async (_sandboxId: string, path: string) => {
      if (path.includes("file-1") && path.includes("-fr")) {
        return Buffer.from('{"hello":"Bonjour"}', "utf8");
      }
      if (path.includes("file-2") && path.includes("-fr")) {
        throw new Error("translated output not found");
      }
      if (path.includes("file-1")) {
        return Buffer.from('{"hello":"Hello"}', "utf8");
      }
      if (path.includes("file-2")) {
        return Buffer.from('{"bye":"Goodbye"}', "utf8");
      }
      return Buffer.from("{}", "utf8");
    });

    const result = await translateProviderJobFiles({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "crowdin",
      sourceFiles: [
        {
          id: "file-1",
          displayName: "a.json",
          sourcePath: "locales/a.json",
        },
        {
          id: "file-2",
          displayName: "b.json",
          sourcePath: "locales/b.json",
        },
      ],
      content: {
        externalJobId: "task-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-1",
            translations: [],
          },
          {
            externalStringId: "2",
            key: "bye",
            sourceText: "Goodbye",
            fileId: "file-2",
            translations: [],
          },
        ],
      },
    });

    expect(result.changedItems).toEqual([expect.objectContaining({ key: "hello", to: "Bonjour" })]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Batch file translation failed"),
        expect.stringContaining("File translation failed for b.json (fr)"),
      ]),
    );
  });

  it("does not create a sandbox for fully translated files mixed with pending files", async () => {
    const result = await translateProviderJobFiles({
      organizationId: "org_1",
      projectId: "project_1",
      providerKind: "crowdin",
      sourceFiles: [
        {
          id: "file-done",
          displayName: "done.json",
          sourcePath: "locales/done.json",
        },
        {
          id: "file-pending",
          displayName: "pending.json",
          sourcePath: "locales/pending.json",
        },
      ],
      content: {
        externalJobId: "task-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "hello",
            sourceText: "Hello",
            fileId: "file-done",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
          {
            externalStringId: "2",
            key: "bye",
            sourceText: "Goodbye",
            fileId: "file-pending",
            translations: [],
          },
        ],
      },
    });

    expect(createTranslationSandboxMock).toHaveBeenCalledTimes(1);
    expect(downloadCrowdinSourceInSandboxMock).toHaveBeenCalledTimes(1);
    expect(downloadCrowdinSourceInSandboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ externalFileId: "file-pending" }),
    );
    expect(buildMultiFileMultiLocaleTempConfigMock).toHaveBeenCalledWith(
      [
        {
          from: "work_file-pending_pending.json",
          to: "work_file-pending_pending-{{target}}.json",
        },
      ],
      "en",
      ["fr"],
      null,
      expect.any(Object),
    );
    expect(result.filesProcessed).toBe(1);
    expect(result.skippedExistingLocales).toBe(1);
  });
});
