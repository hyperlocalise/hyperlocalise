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

vi.mock("workflow", () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: "run_1" })),
}));

const mocks = vi.hoisted(() => ({
  claimTranslationJobStep: vi.fn(),
  failTranslationJobStep: vi.fn(),
  planKeyTranslationJob: vi.fn(),
  translateKeyBatch: vi.fn(),
  completeKeyTranslationJob: vi.fn(),
  chargeFailedKeyTranslationRun: vi.fn(),
}));

vi.mock("./steps/translation-job", () => ({
  claimTranslationJobStep: mocks.claimTranslationJobStep,
  ensureAiFeaturesAllowedStep: vi.fn(async () => ({ ok: true })),
  failTranslationJobStep: mocks.failTranslationJobStep,
  recordJobEventsStep: vi.fn(),
  resolveWorkspaceReportsFlagStep: vi.fn(async () => false),
}));

vi.mock("@/lib/translation/key-translation-job", () => ({
  planKeyTranslationJob: mocks.planKeyTranslationJob,
  captureKeyTranslationAnalysis: vi.fn(),
  translateKeyBatch: mocks.translateKeyBatch,
  completeKeyTranslationJob: mocks.completeKeyTranslationJob,
  chargeFailedKeyTranslationRun: mocks.chargeFailedKeyTranslationRun,
}));

import { keyTranslationJobWorkflow } from "./key-translation-job";

const event = { kind: "translation", jobId: "job_1", projectId: "proj_1", type: "keys" } as const;
const tokenUsage = {
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
  modelId: "openai/gpt-5",
  credentialSource: "gateway" as const,
};

function itemsFor(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    translationKeyId: `key_${index}`,
    targetLocales: ["fr-FR"],
  }));
}

describe("keyTranslationJobWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimTranslationJobStep.mockResolvedValue({
      kind: "claimed",
      job: {
        id: "job_1",
        projectId: "proj_1",
        type: "keys",
        inputPayload: {},
        workflowRunId: "run_1",
        knowledgeMemoryEnabled: false,
      },
    });
    mocks.planKeyTranslationJob.mockResolvedValue({
      organizationId: "org_1",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      overwriteUnapproved: false,
      items: itemsFor(20),
      stringCount: 20,
      plannedAt: "2026-11-10 00:00:00+00",
      knowledgeMemoryEnabled: false,
    });
  });

  it("charges the tokens already used when the job is cancelled between batches", async () => {
    mocks.translateKeyBatch
      .mockResolvedValueOnce({ translated: { "fr-FR": 10 }, failed: {}, tokenUsage })
      .mockResolvedValueOnce({
        translated: { "fr-FR": 3 },
        failed: {},
        tokenUsage,
        stopped: true,
      });

    const result = await keyTranslationJobWorkflow(event);

    expect(result).toEqual({ status: "stopped" });
    expect(mocks.completeKeyTranslationJob).not.toHaveBeenCalled();
    expect(mocks.chargeFailedKeyTranslationRun).toHaveBeenCalledTimes(1);
    expect(mocks.chargeFailedKeyTranslationRun).toHaveBeenCalledWith({
      jobId: "job_1",
      workflowRunId: "run_1",
      organizationId: "org_1",
      tokenUsage: expect.objectContaining({ inputTokens: 20, outputTokens: 10, totalTokens: 30 }),
      reason: "cancelled",
    });
  });

  it("charges the tokens when the job is cancelled just before it completes", async () => {
    mocks.translateKeyBatch.mockResolvedValue({
      translated: { "fr-FR": 10 },
      failed: {},
      tokenUsage,
    });
    mocks.completeKeyTranslationJob.mockResolvedValue({ completed: false });

    const result = await keyTranslationJobWorkflow(event);

    expect(result).toEqual({ status: "stopped" });
    expect(mocks.completeKeyTranslationJob).toHaveBeenCalledTimes(1);
    expect(mocks.chargeFailedKeyTranslationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: expect.objectContaining({ totalTokens: 30 }),
        reason: "cancelled",
      }),
    );
    expect(mocks.failTranslationJobStep).not.toHaveBeenCalled();
  });

  it("charges nothing extra when a stopped run made no model call", async () => {
    mocks.translateKeyBatch.mockResolvedValue({
      translated: {},
      failed: {},
      tokenUsage: null,
      stopped: true,
    });

    const result = await keyTranslationJobWorkflow(event);

    expect(result).toEqual({ status: "stopped" });
    expect(mocks.chargeFailedKeyTranslationRun).not.toHaveBeenCalled();
  });

  it("charges a completed job once through its completion, not as an unfinished run", async () => {
    mocks.translateKeyBatch.mockResolvedValue({
      translated: { "fr-FR": 10 },
      failed: {},
      tokenUsage,
    });
    mocks.completeKeyTranslationJob.mockResolvedValue({ completed: true });

    const result = await keyTranslationJobWorkflow(event);

    expect(result).toEqual({ status: "succeeded" });
    expect(mocks.completeKeyTranslationJob).toHaveBeenCalledWith(
      expect.objectContaining({ madeModelCalls: true }),
    );
    expect(mocks.chargeFailedKeyTranslationRun).not.toHaveBeenCalled();
  });
});
