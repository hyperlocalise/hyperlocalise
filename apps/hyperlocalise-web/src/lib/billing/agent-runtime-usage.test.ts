import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { completeAndTrackBillableUsageMock, reserveUsageEventMock } = vi.hoisted(() => ({
  completeAndTrackBillableUsageMock: vi.fn(),
  reserveUsageEventMock: vi.fn(),
}));

vi.mock("@/lib/billing/usage-control", () => ({
  completeAndTrackBillableUsage: completeAndTrackBillableUsageMock,
  formatUsageControlError: (error: { code: string }) => error.code,
  reserveUsageEvent: reserveUsageEventMock,
  usageFeatureIds: {
    agentRuns: "agent-runs",
  },
}));

import {
  reserveAgentRuntimeUsage,
  trackSucceededAgentRuntimeUsage,
} from "@/lib/billing/agent-runtime-usage";
import { ok } from "@/lib/primitives/result/results";

describe("agent-runtime-usage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it("fails open when Autumn usage tracking throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    completeAndTrackBillableUsageMock.mockRejectedValue(new Error("network unavailable"));

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

  it("completes billable agent runtime usage through the shared helper", async () => {
    completeAndTrackBillableUsageMock.mockResolvedValue(ok({ status: "tracking_succeeded" }));

    await trackSucceededAgentRuntimeUsage({
      organizationId: "org_123",
      operationKey: "agent-run:test",
      dimensions: { surface: "web" },
    });

    expect(completeAndTrackBillableUsageMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      operationKey: "agent-run:test",
      autumnEventName: "agent_run.completed",
      unit: "run",
      dimensions: { surface: "web" },
      aiCreditSource: "agent_runtime_complete",
    });
  });
});
