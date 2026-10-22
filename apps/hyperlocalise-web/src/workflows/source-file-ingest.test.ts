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

const mocks = vi.hoisted(() => ({
  claimSourceFileIngestStep: vi.fn(),
  getStoredFileMetadataStep: vi.fn(),
  createSourceIngestSandboxStep: vi.fn(),
  prepareSourceIngestSandboxStep: vi.fn(),
  writeSourceIngestFileStep: vi.fn(),
  extractSourceIngestEntriesStep: vi.fn(),
  extractOfficeSourceEntriesStep: vi.fn(),
  extractPdfSourceEntriesStep: vi.fn(),
  loadSourceFileSegmentationStep: vi.fn(),
  writeSourceFileSegmentationSrxStep: vi.fn(),
  parseHlEntriesStep: vi.fn(),
  reconcileSourceFileTranslationKeysStep: vi.fn(),
  markSourceFileIngestStateStep: vi.fn(),
  dispatchSourceUploadAutomationsStep: vi.fn(),
  stopSourceIngestSandboxStep: vi.fn(),
  ensureImageVariantsForSourceFileStep: vi.fn(),
  ensureVideoVariantsForSourceFileStep: vi.fn(),
  getProjectTargetLocalesStep: vi.fn(),
  getProjectSourceLocaleStep: vi.fn(),
}));
const cliRelease = vi.hoisted(() => ({ parsesOffice: false }));
vi.mock("workflow", () => ({ getWorkflowMetadata: () => ({ workflowRunId: "run" }) }));
vi.mock("./steps/source-file-ingest", () => mocks);
vi.mock("./steps/translation-job", () => ({ getStoredFileContentStep: vi.fn(async () => "{}") }));
vi.mock("@/lib/translation/sandbox-cli-version", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/sandbox-cli-version")>()),
  sandboxCliParsesOffice: () => cliRelease.parsesOffice,
}));

import { sourceFileIngestWorkflow } from "./source-file-ingest";

const event = {
  organizationId: "org",
  projectId: "project",
  sourceFileVersionId: "version",
  storedFileId: "stored",
  sourcePath: "en.json",
};

beforeEach(() => {
  vi.resetAllMocks();
  cliRelease.parsesOffice = false;
  mocks.claimSourceFileIngestStep.mockResolvedValue({
    repositorySourceFileId: "file",
    sourceHash: "hash",
  });
  mocks.getStoredFileMetadataStep.mockResolvedValue({ filename: "en.json" });
  mocks.createSourceIngestSandboxStep.mockResolvedValue({ sandboxId: "sandbox" });
  mocks.loadSourceFileSegmentationStep.mockResolvedValue({ enabled: false, template: "default" });
  mocks.writeSourceFileSegmentationSrxStep.mockResolvedValue({});
  mocks.extractSourceIngestEntriesStep.mockResolvedValue({});
  mocks.parseHlEntriesStep.mockResolvedValue([]);
  mocks.reconcileSourceFileTranslationKeysStep.mockResolvedValue({ status: "ingested" });
  mocks.stopSourceIngestSandboxStep.mockResolvedValue(undefined);
});

describe("sourceFileIngestWorkflow reconciliation", () => {
  it("reconciles a valid empty snapshot before dispatching automations", async () => {
    await sourceFileIngestWorkflow(event);
    expect(mocks.reconcileSourceFileTranslationKeysStep).toHaveBeenCalledWith({
      organizationId: "org",
      projectId: "project",
      repositorySourceFileId: "file",
      sourceFileVersionId: "version",
      workflowRunId: "run",
      entries: [],
    });
    expect(mocks.dispatchSourceUploadAutomationsStep).toHaveBeenCalledOnce();
    expect(mocks.markSourceFileIngestStateStep).not.toHaveBeenCalled();
  });

  it("preserves keys when parsing fails", async () => {
    mocks.parseHlEntriesStep.mockRejectedValue(new Error("Invalid input"));
    await expect(sourceFileIngestWorkflow(event)).rejects.toThrow("Invalid input");
    expect(mocks.reconcileSourceFileTranslationKeysStep).not.toHaveBeenCalled();
    expect(mocks.dispatchSourceUploadAutomationsStep).not.toHaveBeenCalled();
    expect(mocks.markSourceFileIngestStateStep).toHaveBeenCalledWith(
      expect.objectContaining({ ingestState: "failed" }),
    );
    expect(mocks.stopSourceIngestSandboxStep).toHaveBeenCalledWith("sandbox");
  });

  it("does not dispatch superseded snapshots", async () => {
    mocks.reconcileSourceFileTranslationKeysStep.mockResolvedValue({ status: "superseded" });
    await expect(sourceFileIngestWorkflow(event)).resolves.toEqual({
      status: "skipped",
      reason: "superseded",
    });
    expect(mocks.dispatchSourceUploadAutomationsStep).not.toHaveBeenCalled();
  });

  it("does not mark committed ingestion failed when downstream dispatch fails", async () => {
    mocks.dispatchSourceUploadAutomationsStep.mockRejectedValue(new Error("Dispatch failed"));
    await expect(sourceFileIngestWorkflow(event)).rejects.toThrow("Dispatch failed");
    expect(mocks.markSourceFileIngestStateStep).not.toHaveBeenCalled();
  });
});

describe("sourceFileIngestWorkflow documents", () => {
  it("extracts markdown keys and still ensures image variants", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    mocks.parseHlEntriesStep.mockResolvedValue([
      { key: "md.Heading[0]", text: "Intro", context: null, type: "string" },
    ]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "docs/intro.md" }),
    ).resolves.toEqual({
      status: "ingested",
      importedKeyCount: 1,
    });
    expect(mocks.ensureImageVariantsForSourceFileStep).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "docs/intro.md" }),
    );
    expect(mocks.extractSourceIngestEntriesStep).toHaveBeenCalled();
    expect(mocks.reconcileSourceFileTranslationKeysStep).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [{ key: "md.Heading[0]", text: "Intro", context: null, type: "string" }],
      }),
    );
    expect(mocks.ensureVideoVariantsForSourceFileStep).not.toHaveBeenCalled();
  });

  it("passes HTML source text so ingest can assign tag-path keys", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    mocks.parseHlEntriesStep.mockResolvedValue([
      { key: "html.body.p", text: "Hello", context: null, type: "string" },
    ]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "pages/home.html" }),
    ).resolves.toEqual({
      status: "ingested",
      importedKeyCount: 1,
    });
    expect(mocks.parseHlEntriesStep).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ sourcePath: "pages/home.html", sourceContent: "{}" }),
    );
  });

  it("extracts PDF segments through go-svc without a sandbox", async () => {
    mocks.extractPdfSourceEntriesStep.mockResolvedValue({ "page-1#1": "Hello" });
    mocks.parseHlEntriesStep.mockResolvedValue([
      { key: "page-1#1", text: "Hello", context: null, type: "string" },
    ]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "docs/sample-local-pdf.pdf" }),
    ).resolves.toEqual({
      status: "ingested",
      importedKeyCount: 1,
    });

    expect(mocks.extractPdfSourceEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "docs/sample-local-pdf.pdf" }),
    );
    expect(mocks.createSourceIngestSandboxStep).not.toHaveBeenCalled();
    expect(mocks.extractSourceIngestEntriesStep).not.toHaveBeenCalled();
  });

  it("does not extract keys for binary image files", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    await expect(sourceFileIngestWorkflow({ ...event, sourcePath: "hero.png" })).resolves.toEqual({
      status: "ingested",
      importedKeyCount: 0,
    });
    expect(mocks.ensureImageVariantsForSourceFileStep).toHaveBeenCalled();
    expect(mocks.extractSourceIngestEntriesStep).not.toHaveBeenCalled();
    expect(mocks.reconcileSourceFileTranslationKeysStep).not.toHaveBeenCalled();
  });
});

describe("sourceFileIngestWorkflow Office files", () => {
  const xlsxEntry = { key: "home.title", text: "Home", context: null, type: "string" };

  it("extracts Excel segments in-process and reconciles them without a sandbox", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    mocks.extractOfficeSourceEntriesStep.mockResolvedValue([xlsxEntry]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "copy/strings.xlsx" }),
    ).resolves.toEqual({ status: "ingested", importedKeyCount: 1 });
    expect(mocks.extractOfficeSourceEntriesStep).toHaveBeenCalledWith({
      organizationId: "org",
      projectId: "project",
      storedFileId: "stored",
      sourcePath: "copy/strings.xlsx",
    });
    expect(mocks.reconcileSourceFileTranslationKeysStep).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [xlsxEntry] }),
    );
    expect(mocks.dispatchSourceUploadAutomationsStep).toHaveBeenCalledOnce();
    expect(mocks.createSourceIngestSandboxStep).not.toHaveBeenCalled();
    expect(mocks.markSourceFileIngestStateStep).not.toHaveBeenCalled();
  });

  it("re-keys a legacy Office upload without firing upload automations again", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    mocks.extractOfficeSourceEntriesStep.mockResolvedValue([xlsxEntry]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "copy/strings.xlsx", reingest: true }),
    ).resolves.toEqual({ status: "ingested", importedKeyCount: 1 });
    expect(mocks.reconcileSourceFileTranslationKeysStep).toHaveBeenCalledOnce();
    expect(mocks.dispatchSourceUploadAutomationsStep).not.toHaveBeenCalled();
  });

  it("marks the version failed when the workbook cannot be read", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    mocks.extractOfficeSourceEntriesStep.mockRejectedValue(
      new Error("failed to extract entries from the Office file: invalid_xlsx"),
    );

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "copy/strings.xlsx" }),
    ).rejects.toThrow("invalid_xlsx");
    expect(mocks.reconcileSourceFileTranslationKeysStep).not.toHaveBeenCalled();
    expect(mocks.markSourceFileIngestStateStep).toHaveBeenCalledWith(
      expect.objectContaining({
        ingestState: "failed",
        ingestError: "the file format could not be parsed into translation keys",
      }),
    );
  });

  it("parses Excel segments with hl entries once the sandbox CLI reads workbooks", async () => {
    cliRelease.parsesOffice = true;
    mocks.getStoredFileMetadataStep.mockResolvedValue({ filename: "strings.xlsx" });
    mocks.getProjectSourceLocaleStep.mockResolvedValue("en-US");
    mocks.parseHlEntriesStep.mockResolvedValue([xlsxEntry]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "copy/strings.xlsx" }),
    ).resolves.toEqual({ status: "ingested", importedKeyCount: 1 });
    expect(mocks.extractSourceIngestEntriesStep).toHaveBeenCalledWith("sandbox", "strings.xlsx", {
      sourceLocale: "en-US",
      locale: "en-US",
    });
    expect(mocks.loadSourceFileSegmentationStep).not.toHaveBeenCalled();
    expect(mocks.extractOfficeSourceEntriesStep).not.toHaveBeenCalled();
    expect(mocks.markSourceFileIngestStateStep).not.toHaveBeenCalled();
    expect(mocks.reconcileSourceFileTranslationKeysStep).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [xlsxEntry] }),
    );
    expect(mocks.stopSourceIngestSandboxStep).toHaveBeenCalledWith("sandbox");
  });

  it("always keys legacy .xls workbooks in-process", async () => {
    cliRelease.parsesOffice = true;
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    mocks.extractOfficeSourceEntriesStep.mockResolvedValue([xlsxEntry]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "copy/strings.xls" }),
    ).resolves.toEqual({ status: "ingested", importedKeyCount: 1 });
    expect(mocks.extractOfficeSourceEntriesStep).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "copy/strings.xls" }),
    );
    expect(mocks.createSourceIngestSandboxStep).not.toHaveBeenCalled();
  });

  it("keys Word and PowerPoint files in-process until the sandbox CLI parses them", async () => {
    mocks.getProjectTargetLocalesStep.mockResolvedValue(["fr"]);
    const paragraph = { key: "word/document.xml#0", text: "Launch plan", context: null };
    mocks.extractOfficeSourceEntriesStep.mockResolvedValue([paragraph]);

    for (const sourcePath of ["docs/report.docx", "decks/launch.pptx"]) {
      await expect(sourceFileIngestWorkflow({ ...event, sourcePath })).resolves.toEqual({
        status: "ingested",
        importedKeyCount: 1,
      });
      expect(mocks.extractOfficeSourceEntriesStep).toHaveBeenCalledWith(
        expect.objectContaining({ sourcePath }),
      );
    }
    expect(mocks.createSourceIngestSandboxStep).not.toHaveBeenCalled();
  });

  it("parses Word paragraphs with hl entries and no SRX once the CLI reads them", async () => {
    cliRelease.parsesOffice = true;
    const paragraph = { key: "word/document.xml#0", text: "Launch plan", context: null };
    mocks.getStoredFileMetadataStep.mockResolvedValue({ filename: "report.docx" });
    mocks.parseHlEntriesStep.mockResolvedValue([paragraph]);

    await expect(
      sourceFileIngestWorkflow({ ...event, sourcePath: "docs/report.docx" }),
    ).resolves.toEqual({ status: "ingested", importedKeyCount: 1 });
    expect(mocks.extractSourceIngestEntriesStep).toHaveBeenCalledWith("sandbox", "report.docx", {});
    expect(mocks.loadSourceFileSegmentationStep).not.toHaveBeenCalled();
    expect(mocks.getProjectSourceLocaleStep).not.toHaveBeenCalled();
    expect(mocks.extractOfficeSourceEntriesStep).not.toHaveBeenCalled();
  });
});
