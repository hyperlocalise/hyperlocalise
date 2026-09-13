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
}));
vi.mock("workflow", () => ({ getWorkflowMetadata: () => ({ workflowRunId: "run" }) }));
vi.mock("./steps/source-file-ingest", () => mocks);
vi.mock("./steps/translation-job", () => ({ getStoredFileContentStep: vi.fn(async () => "{}") }));

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
