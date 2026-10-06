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
import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { createOpenAIMock, createAnthropicMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn((options: { apiKey: string; baseURL?: string }) => {
    return Object.assign((modelId: string) => ({ kind: "openai", modelId, options }), {
      chat: (modelId: string) => ({ kind: "openai.chat", modelId, options }),
    });
  }),
  createAnthropicMock: vi.fn((options: { apiKey: string }) => {
    return (modelId: string) => ({ kind: "anthropic", modelId, options });
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicMock,
}));

import {
  getAgentProviderOptions,
  getManagedImageModel,
  getManagedLanguageModel,
  getManagedTranscribeModel,
  getManagedTtsModel,
  getManagedVideoModel,
  hyperlocaliseImageModelId,
  hyperlocaliseManagedGatewayModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseTtsModelId,
  hyperlocaliseVideoModelId,
  resolveProviderLanguageModel,
} from "./language-model";

describe("managed language model", () => {
  it("uses Vercel AI Gateway model strings", () => {
    expect(getManagedLanguageModel()).toBe(hyperlocaliseManagedGatewayModelId);
    expect(getManagedImageModel()).toBe(hyperlocaliseImageModelId);
    expect(getManagedVideoModel()).toBe(hyperlocaliseVideoModelId);
    expect(getManagedTtsModel()).toBe(hyperlocaliseTtsModelId);
    expect(getManagedTranscribeModel()).toBe(hyperlocaliseTranscribeModelId);
    expect(hyperlocaliseManagedGatewayModelId).toBe("openai/gpt-6-luna");
    expect(hyperlocaliseImageModelId).toBe("openai/gpt-image-2.5-flare");
    expect(hyperlocaliseVideoModelId).toBe("bytedance/seedance-2.5");
    expect(hyperlocaliseTtsModelId).toBe("fish-audio/s2.1-pro");
    expect(hyperlocaliseTranscribeModelId).toBe("google/gemini-3.5-transcribe");
    expect(createOpenAIMock).not.toHaveBeenCalled();
    expect(createAnthropicMock).not.toHaveBeenCalled();
  });
});

describe("resolveProviderLanguageModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the Anthropic AI SDK client for Anthropic keys", () => {
    expect(
      resolveProviderLanguageModel({
        provider: "anthropic",
        apiKey: "sk-ant",
        model: "claude-sonnet-4-6",
      }),
    ).toEqual({
      kind: "anthropic",
      modelId: "claude-sonnet-4-6",
      options: { apiKey: "sk-ant" },
    });
  });

  it("uses the OpenAI AI SDK client for OpenAI keys", () => {
    expect(
      resolveProviderLanguageModel({
        provider: "openai",
        apiKey: "sk-openai",
        model: "gpt-6-luna",
      }),
    ).toEqual({
      kind: "openai",
      modelId: "gpt-6-luna",
      options: { apiKey: "sk-openai" },
    });
  });

  it("uses an OpenAI-compatible client for Gemini keys", () => {
    expect(
      resolveProviderLanguageModel({
        provider: "gemini",
        apiKey: "gem-key",
        model: "gemini-3.5-flash",
      }),
    ).toEqual({
      kind: "openai.chat",
      modelId: "gemini-3.5-flash",
      options: {
        apiKey: "gem-key",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      },
    });
  });
});

describe("resolveProviderLanguageModel requests", () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("@ai-sdk/openai")>("@ai-sdk/openai");
    createOpenAIMock.mockImplementationOnce(
      actual.createOpenAI as unknown as typeof createOpenAIMock,
    );
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"],
    ["groq", "https://api.groq.com/openai/v1/chat/completions"],
    ["mistral", "https://api.mistral.ai/v1/chat/completions"],
  ] as const)("sends %s requests to Chat Completions", async (provider, url) => {
    const model = resolveProviderLanguageModel({
      provider,
      apiKey: "test-key",
      model: "test-model",
    });

    const result = await generateText({ model, prompt: "hi", maxRetries: 0 });

    expect(result.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(url);
  });
});

describe("getAgentProviderOptions", () => {
  it("keeps OpenAI reasoning options for Gateway and OpenAI BYOK", () => {
    expect(getAgentProviderOptions("gateway")).toEqual({
      openai: { reasoningSummary: "auto" },
    });
    expect(getAgentProviderOptions("openai")).toEqual({
      openai: { reasoningSummary: "auto" },
    });
    expect(getAgentProviderOptions("anthropic")).toBeUndefined();
  });
});
