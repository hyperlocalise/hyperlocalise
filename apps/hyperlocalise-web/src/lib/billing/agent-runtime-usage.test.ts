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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { completeAndTrackBillableUsageMock, ensureAiFeaturesAllowedMock, reserveUsageEventMock } =
  vi.hoisted(() => ({
    completeAndTrackBillableUsageMock: vi.fn(),
    ensureAiFeaturesAllowedMock: vi.fn(),
    reserveUsageEventMock: vi.fn(),
  }));

vi.mock("@/lib/billing/usage-control", () => ({
  completeAndTrackBillableUsage: completeAndTrackBillableUsageMock,
  formatUsageControlError: (error: { code: string }) => error.code,
  reserveUsageEvent: reserveUsageEventMock,
  usageFeatureIds: {
    agentRuns: "agent_runs",
  },
}));

vi.mock("@/lib/billing/ai-features", () => ({
  ensureAiFeaturesAllowed: ensureAiFeaturesAllowedMock,
  AiFeaturesRequiredError: class AiFeaturesRequiredError extends Error {
    readonly code: string;

    constructor(error: { code: string; message: string }) {
      super(error.message);
      this.name = "AiFeaturesRequiredError";
      this.code = error.code;
    }
  },
}));

import {
  extractAiSdkTokenUsage,
  extractGenerateResultTokenUsage,
  reserveAgentRuntimeUsage,
  trackSucceededAgentRuntimeUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { AiFeaturesRequiredError } from "@/lib/billing/ai-features";
import { err, ok } from "@/lib/primitives/result/results";

describe("agent-runtime-usage", () => {
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
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
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

  it("does not complete usage when the metered run throws", async () => {
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
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
    ensureAiFeaturesAllowedMock.mockResolvedValue(ok(undefined));
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

  it("does not run when AI features are denied", async () => {
    const run = vi.fn();
    ensureAiFeaturesAllowedMock.mockResolvedValue(
      err({
        code: "ai_features_required",
        message: "AI features are not included in your current plan.",
      }),
    );

    await expect(
      withAgentRuntimeUsageMetering({
        organizationId: "org_123",
        operationKey: "workspace-automation:run_denied:agent_runs",
        source: "workspace_orchestrator",
        run,
      }),
    ).rejects.toBeInstanceOf(AiFeaturesRequiredError);

    expect(run).not.toHaveBeenCalled();
    expect(reserveUsageEventMock).not.toHaveBeenCalled();
  });
});
