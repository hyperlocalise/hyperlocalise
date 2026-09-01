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

const {
  completeAndTrackBillableUsageMock,
  reserveUsageEventMock,
  getManagedAiPricingConfigMock,
  getManagedAiCreditReservationMock,
  reserveManagedAiCreditMock,
  releaseManagedAiCreditMock,
} = vi.hoisted(() => ({
  completeAndTrackBillableUsageMock: vi.fn(),
  reserveUsageEventMock: vi.fn(),
  getManagedAiPricingConfigMock: vi.fn(),
  getManagedAiCreditReservationMock: vi.fn(),
  reserveManagedAiCreditMock: vi.fn(),
  releaseManagedAiCreditMock: vi.fn(),
}));

vi.mock("@/lib/billing/usage-control", () => ({
  completeAndTrackBillableUsage: completeAndTrackBillableUsageMock,
  formatUsageControlError: (error: { code: string }) => error.code,
  reserveUsageEvent: reserveUsageEventMock,
  usageFeatureIds: {
    agentRuns: "agent_runs",
  },
}));

vi.mock("@/lib/billing/managed-ai-pricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/managed-ai-pricing")>();
  return {
    ...actual,
    getManagedAiPricingConfig: getManagedAiPricingConfigMock,
  };
});

vi.mock("@/lib/billing/managed-ai-credit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/managed-ai-credit")>();
  return {
    ...actual,
    getManagedAiCreditReservation: getManagedAiCreditReservationMock,
    reserveManagedAiCredit: reserveManagedAiCreditMock,
    releaseManagedAiCredit: releaseManagedAiCreditMock,
  };
});

import {
  agentRunAiCreditOperationKey,
  extractAiSdkTokenUsage,
  extractGenerateResultTokenUsage,
  releaseAgentRunAiCredit,
  reserveAgentRunAiCredit,
  reserveAgentRuntimeUsage,
  trackSucceededAgentRuntimeUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { ok } from "@/lib/primitives/result/results";

describe("agent-runtime-usage", () => {
  beforeEach(() => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "legacy",
      pricingVersion: "test",
      chatReservationUsd: 0.5,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
    getManagedAiCreditReservationMock.mockResolvedValue(null);
    reserveManagedAiCreditMock.mockResolvedValue({
      ok: true,
      value: {
        operationKey: "workspace-automation:run_1:agent_runs:ai_tokens",
        mode: "enforced",
        credentialSource: "gateway",
        estimatedAmountUsd: 0.5,
      },
    });
    releaseManagedAiCreditMock.mockResolvedValue({ ok: true, value: undefined });
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
    });

    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      operationKey: "agent-run:test",
      autumnEventName: "agent_run.completed",
      unit: "run",
      dimensions: { surface: "web" },
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
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
      }),
    );
  });

  it("preflights token-producing managed agents and supplies default model metadata", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "enforced",
      pricingVersion: "test",
      chatReservationUsd: 0.5,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
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

    expect(reserveManagedAiCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "openai/gpt-5.6-luna",
        credentialSource: "gateway",
        estimatedAmountUsd: 0.5,
      }),
    );
    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aiCreditModelId: "openai/gpt-5.6-luna",
        aiCreditCredentialSource: "gateway",
        aiCreditEstimatedAmountUsd: 0.5,
      }),
    );
  });

  it("releases reserved AI credit when a successful run reports no token usage", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "enforced",
      pricingVersion: "test",
      chatReservationUsd: 0.5,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
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

    expect(releaseManagedAiCreditMock).toHaveBeenCalledWith({
      reservation: expect.objectContaining({
        operationKey: "workspace-automation:run_1:agent_runs:ai_tokens",
      }),
      reason: "no_token_usage",
    });
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

  it("does not reserve provider-agent credit in legacy metering mode", async () => {
    await expect(
      reserveAgentRunAiCredit({
        organizationId: "org_123",
        runId: "run_1",
        source: "agent_run_complete",
        modelId: "openai/gpt-5.6-luna",
        credentialSource: "gateway",
      }),
    ).resolves.toEqual(ok(null));
    expect(reserveManagedAiCreditMock).not.toHaveBeenCalled();
  });

  it("reuses an outstanding provider-agent reservation instead of creating a second one", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "enforced",
      pricingVersion: "test",
      chatReservationUsd: 0.5,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
    const existing = {
      operationKey: agentRunAiCreditOperationKey("run_1"),
      status: "reserved",
    };
    getManagedAiCreditReservationMock.mockResolvedValue(existing);

    await expect(
      reserveAgentRunAiCredit({
        organizationId: "org_123",
        runId: "run_1",
        source: "agent_run_complete",
        modelId: "openai/gpt-5.6-luna",
        credentialSource: "gateway",
      }),
    ).resolves.toEqual(ok(existing));
    expect(reserveManagedAiCreditMock).not.toHaveBeenCalled();
  });

  it("reserves estimated chat credit before a managed provider-agent run", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "enforced",
      pricingVersion: "test",
      chatReservationUsd: 0.5,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });

    await reserveAgentRunAiCredit({
      organizationId: "org_123",
      runId: "run_1",
      source: "agent_run_complete",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
    });

    expect(reserveManagedAiCreditMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      operationKey: "agent-run:run_1:agent_runs:ai_tokens",
      source: "agent_run_complete",
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
      estimatedAmountUsd: 0.5,
      mode: "enforced",
      dimensions: {
        surface: "provider_agent",
      },
    });
  });

  it("releases provider-agent credit only when a reservation exists", async () => {
    await releaseAgentRunAiCredit({
      runId: "run_1",
      reason: "agent_run_failed",
    });
    expect(releaseManagedAiCreditMock).not.toHaveBeenCalled();

    const reservation = { operationKey: "agent-run:run_1:agent_runs:ai_tokens" };
    getManagedAiCreditReservationMock.mockResolvedValueOnce(reservation);
    await releaseAgentRunAiCredit({
      runId: "run_1",
      reason: "agent_run_failed",
    });
    expect(releaseManagedAiCreditMock).toHaveBeenCalledWith({
      reservation,
      reason: "agent_run_failed",
    });
  });
});
