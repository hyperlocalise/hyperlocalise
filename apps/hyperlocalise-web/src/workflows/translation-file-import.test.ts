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
  extractOfficeTranslationImportEntriesStep: vi.fn(),
  importTranslationsFromEntriesStep: vi.fn(),
}));
const cliRelease = vi.hoisted(() => ({ parsesOffice: false }));

vi.mock("./steps/source-file-ingest", () => ingestSteps);
vi.mock("./steps/translation-file-import", () => importSteps);
vi.mock("./steps/translation-job", () => ({
  getStoredFileContentStep: vi.fn(async () => Buffer.from("workbook")),
}));
vi.mock("@/lib/translation/sandbox-cli-version", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/sandbox-cli-version")>()),
  sandboxCliParsesOffice: () => cliRelease.parsesOffice,
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
  cliRelease.parsesOffice = false;
  ingestSteps.getStoredFileMetadataStep.mockResolvedValue({ filename: "strings.xlsx" });
  ingestSteps.createSourceIngestSandboxStep.mockResolvedValue({ sandboxId: "sandbox" });
  ingestSteps.getProjectSourceLocaleStep.mockResolvedValue("en-US");
  ingestSteps.stopSourceIngestSandboxStep.mockResolvedValue(undefined);
  importSteps.extractTranslationImportEntriesStep.mockResolvedValue({ "home.title": "Accueil" });
  importSteps.extractOfficeTranslationImportEntriesStep.mockResolvedValue({
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
    expect(importSteps.extractOfficeTranslationImportEntriesStep).toHaveBeenCalledWith({
      organizationId: "org",
      projectId: "project",
      storedFileId: "stored",
      sourcePath: "copy/strings.xlsx",
      targetLocale: "fr-FR",
    });
    expect(ingestSteps.createSourceIngestSandboxStep).not.toHaveBeenCalled();
  });

  it("reads Word documents in-process until the sandbox CLI parses them", async () => {
    await translationFileImportWorkflow({ ...event, sourcePath: "docs/report.docx" });
    expect(importSteps.extractOfficeTranslationImportEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "docs/report.docx" }),
    );
    expect(ingestSteps.createSourceIngestSandboxStep).not.toHaveBeenCalled();
  });

  it("always reads legacy .xls workbooks in-process", async () => {
    cliRelease.parsesOffice = true;

    await translationFileImportWorkflow({ ...event, sourcePath: "copy/legacy.xls" });
    expect(importSteps.extractOfficeTranslationImportEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "copy/legacy.xls" }),
    );
    expect(ingestSteps.createSourceIngestSandboxStep).not.toHaveBeenCalled();
  });

  it("reads workbooks with hl entries and the project source locale", async () => {
    cliRelease.parsesOffice = true;

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
    expect(importSteps.extractOfficeTranslationImportEntriesStep).not.toHaveBeenCalled();
    expect(ingestSteps.stopSourceIngestSandboxStep).toHaveBeenCalledWith("sandbox");
  });

  it("does not look up the source locale for other formats", async () => {
    cliRelease.parsesOffice = true;
    ingestSteps.getStoredFileMetadataStep.mockResolvedValue({ filename: "fr.json" });

    await translationFileImportWorkflow({ ...event, sourcePath: "locales/en.json" });
    expect(ingestSteps.getProjectSourceLocaleStep).not.toHaveBeenCalled();
    expect(importSteps.extractTranslationImportEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: "en.json", sourceLocale: null }),
    );
  });
});
