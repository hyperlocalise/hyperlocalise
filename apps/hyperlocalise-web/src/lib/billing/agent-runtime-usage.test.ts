import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  markUsageEventSucceededByOperationKeyMock,
  reserveUsageEventMock,
  trackUsageEventInAutumnByOperationKeyMock,
} = vi.hoisted(() => ({
  markUsageEventSucceededByOperationKeyMock: vi.fn(),
  reserveUsageEventMock: vi.fn(),
  trackUsageEventInAutumnByOperationKeyMock: vi.fn(),
}));

vi.mock("@/lib/billing/usage-control", () => ({
  formatUsageControlError: (error: { code: string }) => error.code,
  markUsageEventSucceededByOperationKey: markUsageEventSucceededByOperationKeyMock,
  reserveUsageEvent: reserveUsageEventMock,
  trackUsageEventInAutumnByOperationKey: trackUsageEventInAutumnByOperationKeyMock,
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
    markUsageEventSucceededByOperationKeyMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      trackSucceededAgentRuntimeUsage({
        organizationId: "org_123",
        operationKey: "agent-run:test",
      }),
    ).resolves.toBeUndefined();

    expect(trackUsageEventInAutumnByOperationKeyMock).not.toHaveBeenCalled();
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
    markUsageEventSucceededByOperationKeyMock.mockResolvedValue(ok(undefined));
    trackUsageEventInAutumnByOperationKeyMock.mockRejectedValue(new Error("network unavailable"));

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
});
