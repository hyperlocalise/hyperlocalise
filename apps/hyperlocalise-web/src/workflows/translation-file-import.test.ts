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

const ingestSteps = vi.hoisted(() => ({
  createSourceIngestSandboxStep: vi.fn(),
  getProjectSourceLocaleStep: vi.fn(),
  getStoredFileMetadataStep: vi.fn(),
  prepareSourceIngestSandboxStep: vi.fn(),
  stopSourceIngestSandboxStep: vi.fn(),
  writeSourceIngestFileStep: vi.fn(),
}));
const importSteps = vi.hoisted(() => ({
  enqueueFileTranslationsImportedActivityStep: vi.fn(),
  extractTranslationImportEntriesStep: vi.fn(),
  extractXlsxTranslationImportEntriesStep: vi.fn(),
  importTranslationsFromEntriesStep: vi.fn(),
}));
const cliRelease = vi.hoisted(() => ({ parsesXlsx: false }));

vi.mock("./steps/source-file-ingest", () => ingestSteps);
vi.mock("./steps/translation-file-import", () => importSteps);
vi.mock("./steps/translation-job", () => ({
  getStoredFileContentStep: vi.fn(async () => Buffer.from("workbook")),
}));
vi.mock("@/lib/translation/sandbox-cli-release", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/sandbox-cli-release")>()),
  sandboxCliParsesXlsx: () => cliRelease.parsesXlsx,
}));

import { translationFileImportWorkflow } from "./translation-file-import";

const event = {
  organizationId: "org",
  projectId: "project",
  storedFileId: "stored",
  sourcePath: "copy/strings.xlsx",
  targetLocale: "fr-FR",
  actorUserId: "user",
};

beforeEach(() => {
  vi.resetAllMocks();
  cliRelease.parsesXlsx = false;
  ingestSteps.getStoredFileMetadataStep.mockResolvedValue({ filename: "strings.xlsx" });
  ingestSteps.createSourceIngestSandboxStep.mockResolvedValue({ sandboxId: "sandbox" });
  ingestSteps.getProjectSourceLocaleStep.mockResolvedValue("en-US");
  ingestSteps.stopSourceIngestSandboxStep.mockResolvedValue(undefined);
  importSteps.extractTranslationImportEntriesStep.mockResolvedValue({ "home.title": "Accueil" });
  importSteps.extractXlsxTranslationImportEntriesStep.mockResolvedValue({
    "home.title": "Accueil",
  });
  importSteps.importTranslationsFromEntriesStep.mockResolvedValue({
    matched: 1,
    imported: 1,
    skipped: 0,
  });
});

describe("translationFileImportWorkflow workbooks", () => {
  it("reads workbooks in-process until the sandbox CLI parses them", async () => {
    await expect(translationFileImportWorkflow(event)).resolves.toMatchObject({ imported: 1 });
    expect(importSteps.extractXlsxTranslationImportEntriesStep).toHaveBeenCalledWith({
      organizationId: "org",
      projectId: "project",
      storedFileId: "stored",
      targetLocale: "fr-FR",
    });
    expect(ingestSteps.createSourceIngestSandboxStep).not.toHaveBeenCalled();
  });

  it("reads workbooks with hl entries and the project source locale", async () => {
    cliRelease.parsesXlsx = true;

    await expect(translationFileImportWorkflow(event)).resolves.toMatchObject({ imported: 1 });
    expect(importSteps.extractTranslationImportEntriesStep).toHaveBeenCalledWith({
      sandboxId: "sandbox",
      filePath: "strings.xlsx",
      targetLocale: "fr-FR",
      sourceLocale: "en-US",
    });
    expect(importSteps.importTranslationsFromEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ entries: { "home.title": "Accueil" } }),
    );
    expect(importSteps.extractXlsxTranslationImportEntriesStep).not.toHaveBeenCalled();
    expect(ingestSteps.stopSourceIngestSandboxStep).toHaveBeenCalledWith("sandbox");
  });

  it("does not look up the source locale for other formats", async () => {
    cliRelease.parsesXlsx = true;
    ingestSteps.getStoredFileMetadataStep.mockResolvedValue({ filename: "fr.json" });

    await translationFileImportWorkflow({ ...event, sourcePath: "locales/en.json" });
    expect(ingestSteps.getProjectSourceLocaleStep).not.toHaveBeenCalled();
    expect(importSteps.extractTranslationImportEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: "en.json", sourceLocale: null }),
    );
  });
});
