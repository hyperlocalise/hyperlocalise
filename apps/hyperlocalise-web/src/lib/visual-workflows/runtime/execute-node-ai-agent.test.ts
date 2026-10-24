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
  generateText: vi.fn(),
  resolveModel: vi.fn(),
  trackAiCallTokenUsage: vi.fn(),
  ensureAiFeaturesAllowed: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));
vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: mocks.resolveModel,
}));
vi.mock("@/lib/billing/agent-runtime-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/agent-runtime-usage")>()),
  trackAiCallTokenUsage: mocks.trackAiCallTokenUsage,
}));
vi.mock("@/lib/billing/ai-features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/ai-features")>()),
  ensureAiFeaturesAllowed: mocks.ensureAiFeaturesAllowed,
}));

import {
  AI_CREDIT_EXHAUSTED_CODE,
  AI_CREDIT_EXHAUSTED_MESSAGE,
  AI_FEATURES_REQUIRED_CODE,
  AI_FEATURES_REQUIRED_MESSAGE,
} from "@/lib/billing/ai-features";
import { err, ok } from "@/lib/primitives/result/results";

import { createVisualWorkflowExecutionContext } from "./context";
import { executeVisualWorkflowNode } from "./execute-node";

const organizationId = "00000000-0000-4000-8000-000000000001";
const aiNode = {
  id: "ai",
  type: "ai.agent" as const,
  config: { kind: "ai.agent" as const, prompt: "Summarise the release notes." },
};
const usage = { inputTokens: 600, outputTokens: 80, totalTokens: 680 };

describe("executeVisualWorkflowNode AI step metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAiFeaturesAllowed.mockResolvedValue(ok(undefined));
  });

  it("records the AI step's tokens against the workspace's model", async () => {
    mocks.resolveModel.mockResolvedValue({
      model: "openai/gpt-6-luna",
      modelId: "openai/gpt-6-luna",
      source: "gateway",
    });
    mocks.generateText.mockResolvedValue({ text: "Summary", usage });

    const result = await executeVisualWorkflowNode({
      organizationId,
      context: createVisualWorkflowExecutionContext({ triggerInput: {} }),
      node: aiNode as never,
    });

    expect(result).toMatchObject({ ok: true, output: { text: "Summary" } });
    expect(mocks.trackAiCallTokenUsage).toHaveBeenCalledWith({
      organizationId,
      source: "visual_workflow_ai_step",
      tokenUsage: usage,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });
  });

  it("records a call on the workspace's own key at no charge", async () => {
    mocks.resolveModel.mockResolvedValue({
      model: {},
      modelId: "anthropic/claude-sonnet-4.5",
      source: "anthropic",
    });
    mocks.generateText.mockResolvedValue({ text: "Summary", usage });

    await executeVisualWorkflowNode({
      organizationId,
      context: createVisualWorkflowExecutionContext({ triggerInput: {} }),
      node: aiNode as never,
    });

    expect(mocks.trackAiCallTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "anthropic/claude-sonnet-4.5",
        credentialSource: "byok",
      }),
    );
  });

  it("records nothing when the model call fails", async () => {
    mocks.resolveModel.mockResolvedValue({ model: {}, modelId: "x", source: "gateway" });
    mocks.generateText.mockRejectedValue(new Error("timeout"));

    const result = await executeVisualWorkflowNode({
      organizationId,
      context: createVisualWorkflowExecutionContext({ triggerInput: {} }),
      node: aiNode as never,
    });

    expect(result.ok).toBe(false);
    expect(mocks.trackAiCallTokenUsage).not.toHaveBeenCalled();
  });

  it("refuses the model call when the workspace has used up its AI credit", async () => {
    mocks.ensureAiFeaturesAllowed.mockResolvedValue(
      err({
        code: AI_CREDIT_EXHAUSTED_CODE,
        message: AI_CREDIT_EXHAUSTED_MESSAGE,
      }),
    );

    const result = await executeVisualWorkflowNode({
      organizationId,
      context: createVisualWorkflowExecutionContext({ triggerInput: {} }),
      node: aiNode as never,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: AI_CREDIT_EXHAUSTED_CODE,
        message: AI_CREDIT_EXHAUSTED_MESSAGE,
      },
    });
    expect(mocks.ensureAiFeaturesAllowed).toHaveBeenCalledWith({ organizationId });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.trackAiCallTokenUsage).not.toHaveBeenCalled();
  });

  it("refuses the model call when the plan does not include AI features", async () => {
    mocks.ensureAiFeaturesAllowed.mockResolvedValue(
      err({
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      }),
    );

    const result = await executeVisualWorkflowNode({
      organizationId,
      context: createVisualWorkflowExecutionContext({ triggerInput: {} }),
      node: aiNode as never,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: AI_FEATURES_REQUIRED_CODE,
        message: AI_FEATURES_REQUIRED_MESSAGE,
      },
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
