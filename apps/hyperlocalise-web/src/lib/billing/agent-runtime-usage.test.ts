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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import "dotenv/config";

const {
  completeAndTrackBillableUsageMock,
  reserveUsageEventMock,
  ensureAiFeaturesAllowedMock,
  trackAiCreditUsageInAutumnMock,
} = vi.hoisted(() => ({
  completeAndTrackBillableUsageMock: vi.fn(),
  reserveUsageEventMock: vi.fn(),
  ensureAiFeaturesAllowedMock: vi.fn(),
  trackAiCreditUsageInAutumnMock: vi.fn(),
}));

vi.mock("@/lib/billing/usage-control", () => ({
  completeAndTrackBillableUsage: completeAndTrackBillableUsageMock,
  formatUsageControlError: (error: { code: string }) => error.code,
  reserveUsageEvent: reserveUsageEventMock,
  trackAiCreditUsageInAutumn: trackAiCreditUsageInAutumnMock,
  usageFeatureIds: {
    agentRuns: "agent_runs",
  },
}));

vi.mock("@/lib/billing/ai-features", () => ({
  ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock,
  AiFeaturesRequiredError: class AiFeaturesRequiredError extends Error {},
}));

import {
  agentTurnTokenBilling,
  credentialSourceForLanguageModel,
  extractAiSdkTokenUsage,
  extractGenerateResultTokenUsage,
  reserveAgentRuntimeUsage,
  trackAiCallTokenUsage,
  trackStringTranslationTokenUsage,
  trackSucceededAgentRuntimeUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { err, ok } from "@/lib/primitives/result/results";

describe("agent-runtime-usage", () => {
  beforeEach(() => {
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("extracts AI SDK token usage from generate results", () => {
    expect(
      extractGenerateResultTokenUsage({
        totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    ).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });

    expect(extractAiSdkTokenUsage({ inputTokens: 3, outputTokens: 2 })).toEqual({
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
    });
  });

  it("normalizes AI SDK 7 token details into exclusive Autumn pools", () => {
    expect(
      extractGenerateResultTokenUsage({
        usage: {
          inputTokens: 150,
          inputTokenDetails: {
            noCacheTokens: 100,
            cacheReadTokens: 40,
            cacheWriteTokens: 10,
          },
          outputTokens: 25,
          outputTokenDetails: {
            textTokens: 20,
            reasoningTokens: 5,
          },
          totalTokens: 175,
        },
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      reasoningTokens: 5,
      totalTokens: 175,
    });
  });

  it("fails open when reserving usage throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    reserveUsageEventMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      reserveAgentRuntimeUsage({
        organizationId: "org_123",
        operationKey: "agent-run:test",
        source: "chat_agent_turn",
      }),
    ).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalledWith(
      "[agent-runtime-usage] usage event reservation threw",
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "agent-run:test",
        source: "chat_agent_turn",
      }),
    );
  });

  it("fails open when marking usage succeeded throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    completeAndTrackBillableUsageMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      trackSucceededAgentRuntimeUsage({
        organizationId: "org_123",
        operationKey: "agent-run:test",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[agent-runtime-usage] usage event completion threw",
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "agent-run:test",
      }),
    );
  });

  it("fails open when billable usage completion returns an error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    completeAndTrackBillableUsageMock.mockResolvedValue({
      ok: false,
      error: { code: "autumn_usage_tracking_failed" },
    });

    await expect(
      trackSucceededAgentRuntimeUsage({
        organizationId: "org_123",
        operationKey: "agent-run:test",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[agent-runtime-usage] usage event completion failed",
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "agent-run:test",
        error: "autumn_usage_tracking_failed",
      }),
    );
  });

  it("completes billable agent runtime usage through the shared helper", async () => {
    completeAndTrackBillableUsageMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    await trackSucceededAgentRuntimeUsage({
      organizationId: "org_123",
      operationKey: "agent-run:test",
      dimensions: { surface: "web" },
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      aiCreditModelId: "openai/gpt-6-luna",
      aiCreditCredentialSource: "gateway",
    });

    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      operationKey: "agent-run:test",
      autumnEventName: "agent_run.completed",
      unit: "run",
      dimensions: { surface: "web" },
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      aiCreditModelId: "openai/gpt-6-luna",
      aiCreditCredentialSource: "gateway",
      interactionId: undefined,
      aiCreditSource: "agent_runtime_complete",
    });
  });

  it("meters a successful agent generate call end to end", async () => {
    reserveUsageEventMock.mockResolvedValue(ok({ id: "usage_1" }));
    completeAndTrackBillableUsageMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    const result = await withAgentRuntimeUsageMetering({
      organizationId: "org_123",
      operationKey: "workspace-automation:run_1:agent_runs",
      source: "workspace_orchestrator",
      dimensions: { surface: "automation" },
      extractTokenUsage: extractGenerateResultTokenUsage,
      run: async () => ({
        text: "done",
        totalUsage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      }),
    });

    expect(result.text).toBe("done");
    expect(reserveUsageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "workspace-automation:run_1:agent_runs",
        source: "workspace_orchestrator",
      }),
    );
    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: "workspace-automation:run_1:agent_runs",
        tokenUsage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
        aiCreditModelId: "openai/gpt-6-luna",
        aiCreditCredentialSource: "gateway",
      }),
    );
  });

  it("tracks reported tokens after a successful run without a preflight hold", async () => {
    reserveUsageEventMock.mockResolvedValue(ok({ id: "usage_1" }));
    completeAndTrackBillableUsageMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    await withAgentRuntimeUsageMetering({
      organizationId: "org_123",
      operationKey: "workspace-automation:run_1:agent_runs",
      source: "workspace_orchestrator",
      extractTokenUsage: extractGenerateResultTokenUsage,
      run: async () => ({
        usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      }),
    });

    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aiCreditModelId: "openai/gpt-6-luna",
        aiCreditCredentialSource: "gateway",
        tokenUsage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      }),
    );
  });

  it("still completes the agent_runs meter when a successful run reports no token usage", async () => {
    reserveUsageEventMock.mockResolvedValue(ok({ id: "usage_1" }));
    completeAndTrackBillableUsageMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    await expect(
      withAgentRuntimeUsageMetering({
        organizationId: "org_123",
        operationKey: "workspace-automation:run_1:agent_runs",
        source: "workspace_orchestrator",
        extractTokenUsage: () => null,
        run: async () => ({ text: "done" }),
      }),
    ).resolves.toEqual({ text: "done" });

    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: null,
      }),
    );
  });

  it("does not complete usage when the metered run throws", async () => {
    reserveUsageEventMock.mockResolvedValue(ok({ id: "usage_1" }));

    await expect(
      withAgentRuntimeUsageMetering({
        organizationId: "org_123",
        operationKey: "workspace-automation:run_fail:agent_runs",
        source: "workspace_orchestrator",
        run: async () => {
          throw new Error("agent failed");
        },
      }),
    ).rejects.toThrow("agent failed");

    expect(completeAndTrackBillableUsageMock).not.toHaveBeenCalled();
  });

  it("still returns the successful run when usage completion fails", async () => {
    reserveUsageEventMock.mockResolvedValue(ok({ id: "usage_1" }));
    completeAndTrackBillableUsageMock.mockResolvedValue({
      ok: false,
      error: { code: "autumn_usage_tracking_failed" },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withAgentRuntimeUsageMetering({
        organizationId: "org_123",
        operationKey: "workspace-automation:run_tokens_fail:agent_runs",
        source: "workspace_orchestrator",
        run: async () => ({ text: "done" }),
      }),
    ).resolves.toEqual({ text: "done" });

    expect(consoleError).toHaveBeenCalled();
  });

  it("passes a caller's source to the AI Credit row of an agent run", async () => {
    completeAndTrackBillableUsageMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    await trackSucceededAgentRuntimeUsage({
      organizationId: "org_123",
      operationKey: "slack-agent-turn:msg:agent_runs",
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      aiCreditModelId: "openai/gpt-6-luna",
      aiCreditCredentialSource: "gateway",
      aiCreditSource: "slack_agent_turn",
    });

    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ aiCreditSource: "slack_agent_turn" }),
    );
  });

  it("records a single AI call's tokens as AI Credit under a fresh reference", async () => {
    trackAiCreditUsageInAutumnMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));
    const tokenUsage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };

    await trackAiCallTokenUsage({
      organizationId: "org_123",
      source: "content_editor_ai_suggestion",
      tokenUsage,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });
    await trackAiCallTokenUsage({
      organizationId: "org_123",
      source: "content_editor_ai_suggestion",
      tokenUsage,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });

    expect(trackAiCreditUsageInAutumnMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      parentOperationKey: expect.stringMatching(/^ai-call:content_editor_ai_suggestion:/),
      tokenUsage,
      source: "content_editor_ai_suggestion",
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
      interactionId: undefined,
    });
    const [first, second] = trackAiCreditUsageInAutumnMock.mock.calls.map(
      ([input]) => input.parentOperationKey,
    );
    expect(first).not.toBe(second);
  });

  it("records nothing for a call that reported no tokens", async () => {
    await trackAiCallTokenUsage({
      organizationId: "org_123",
      source: "chat_translate_string",
      tokenUsage: null,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });

    expect(trackAiCreditUsageInAutumnMock).not.toHaveBeenCalled();
  });

  it("logs and continues when AI call token tracking fails or throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = {
      organizationId: "org_123",
      source: "content_editor_document_regenerate",
      tokenUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway" as const,
    };

    trackAiCreditUsageInAutumnMock.mockResolvedValueOnce(
      err({ code: "ai_credit_pricing_not_configured", surface: "x" }),
    );
    await expect(trackAiCallTokenUsage(input)).resolves.toBeUndefined();
    trackAiCreditUsageInAutumnMock.mockRejectedValueOnce(new Error("database down"));
    await expect(trackAiCallTokenUsage(input)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it("charges a deferred AI call only when the deferred task runs", async () => {
    trackAiCreditUsageInAutumnMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));
    const deferred: Array<() => Promise<unknown>> = [];

    await trackAiCallTokenUsage(
      {
        organizationId: "org_123",
        source: "content_editor_ai_suggestion",
        tokenUsage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        modelId: "openai/gpt-6-luna",
        credentialSource: "gateway",
      },
      { defer: (task) => deferred.push(task) },
    );

    expect(trackAiCreditUsageInAutumnMock).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    await deferred[0]!();
    expect(trackAiCreditUsageInAutumnMock).toHaveBeenCalledTimes(1);
  });

  it("bills an agent turn's classifier and turn tokens at the resolved model", () => {
    const classification = { inputTokens: 100, outputTokens: 10, totalTokens: 110 };
    const turn = { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 };

    expect(
      agentTurnTokenBilling({
        classificationTokenUsage: classification,
        turnTokenUsage: turn,
        languageModel: { modelId: "openai/gpt-6-luna", source: "gateway" },
      }),
    ).toEqual({
      tokenUsage: expect.objectContaining({
        inputTokens: 1100,
        outputTokens: 210,
        totalTokens: 1310,
      }),
      aiCreditModelId: "openai/gpt-6-luna",
      aiCreditCredentialSource: "gateway",
    });
    expect(
      agentTurnTokenBilling({
        classificationTokenUsage: null,
        turnTokenUsage: turn,
        languageModel: { modelId: "anthropic/claude-sonnet-4.5", source: "anthropic" },
      }),
    ).toMatchObject({
      aiCreditModelId: "anthropic/claude-sonnet-4.5",
      aiCreditCredentialSource: "byok",
    });
    expect(
      agentTurnTokenBilling({
        classificationTokenUsage: null,
        turnTokenUsage: null,
        languageModel: { modelId: "openai/gpt-6-luna", source: "gateway" },
      }),
    ).toEqual({
      tokenUsage: null,
      aiCreditModelId: undefined,
      aiCreditCredentialSource: undefined,
    });
  });

  it("treats only the gateway source as our AI Gateway", () => {
    expect(credentialSourceForLanguageModel({ source: "gateway" })).toBe("gateway");
    expect(credentialSourceForLanguageModel({ source: "openai" })).toBe("byok");
  });

  it("bills a string translation at the model its token usage names", async () => {
    trackAiCreditUsageInAutumnMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    await trackStringTranslationTokenUsage({
      organizationId: "org_123",
      source: "chat_translate_string",
      tokenUsage: {
        inputTokens: 300,
        outputTokens: 40,
        totalTokens: 340,
        modelId: "openai/gpt-6-luna",
        credentialSource: "gateway",
      },
    });
    await trackStringTranslationTokenUsage({
      organizationId: "org_123",
      source: "chat_translate_string",
      tokenUsage: { inputTokens: 300, outputTokens: 40, totalTokens: 340 },
    });

    expect(trackAiCreditUsageInAutumnMock).toHaveBeenCalledTimes(1);
    expect(trackAiCreditUsageInAutumnMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "openai/gpt-6-luna", credentialSource: "gateway" }),
    );
  });
});
