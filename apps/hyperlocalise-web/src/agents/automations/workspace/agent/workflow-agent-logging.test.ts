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

import { workflowAgentLogCallbacks } from "./workflow-agent-logging";

const context = {
  agent: "use_github_repository" as const,
  workspaceAutomationRunId: "run-1",
  organizationId: "org-1",
  workflowRunId: "wrun-1",
};

type Callbacks = ReturnType<typeof workflowAgentLogCallbacks>;
type Event<K extends keyof Callbacks> = Parameters<Callbacks[K]>[0];

const toolCall = { toolName: "read", toolCallId: "call-1", input: { path: "secret.env" } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflowAgentLogCallbacks", () => {
  it("logs tool lifecycle with ids and timings but not tool inputs or outputs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const callbacks = workflowAgentLogCallbacks(context);

    await callbacks.onToolExecutionStart({
      toolCall,
      stepNumber: 2,
    } as Event<"onToolExecutionStart">);
    await callbacks.onToolExecutionEnd({
      toolCall,
      stepNumber: 2,
      durationMs: 1200,
      success: true,
      output: "API_KEY=abc",
    } as Event<"onToolExecutionEnd">);

    expect(info).toHaveBeenNthCalledWith(1, "[workspace-automation-agent] tool started", {
      ...context,
      stepNumber: 2,
      toolName: "read",
      toolCallId: "call-1",
    });
    expect(info).toHaveBeenNthCalledWith(2, "[workspace-automation-agent] tool finished", {
      ...context,
      stepNumber: 2,
      toolName: "read",
      toolCallId: "call-1",
      durationMs: 1200,
    });
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/secret\.env|API_KEY/);
  });

  it("warns with the error message when a tool fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await workflowAgentLogCallbacks(context).onToolExecutionEnd({
      toolCall,
      stepNumber: 0,
      durationMs: 5,
      success: false,
      error: new Error("sandbox_gone"),
    } as Event<"onToolExecutionEnd">);

    expect(warn).toHaveBeenCalledWith(
      "[workspace-automation-agent] tool failed",
      expect.objectContaining({ toolName: "read", error: "sandbox_gone" }),
    );
  });

  it("logs step and run totals without message content", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const callbacks = workflowAgentLogCallbacks(context);
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

    await callbacks.onStart({
      messages: [{ role: "user", content: "customer prompt" }],
    } as Event<"onStart">);
    await callbacks.onStepEnd({
      stepNumber: 1,
      finishReason: "tool-calls",
      usage,
      toolCalls: [toolCall],
    } as unknown as Event<"onStepEnd">);
    await callbacks.onEnd({
      steps: [{}, {}],
      finishReason: "stop",
      totalUsage: usage,
    } as unknown as Event<"onEnd">);

    expect(info).toHaveBeenCalledWith("[workspace-automation-agent] agent started", {
      ...context,
      messageCount: 1,
    });
    expect(info).toHaveBeenCalledWith("[workspace-automation-agent] step finished", {
      ...context,
      stepNumber: 1,
      finishReason: "tool-calls",
      toolCalls: ["read"],
      ...usage,
    });
    expect(info).toHaveBeenCalledWith("[workspace-automation-agent] agent finished", {
      ...context,
      stepCount: 2,
      finishReason: "stop",
      ...usage,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("customer prompt");
  });
});
