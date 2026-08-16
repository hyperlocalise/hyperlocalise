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

const { createGatewayMock, createOpenAIMock, createAnthropicMock, envState } = vi.hoisted(() => ({
  createGatewayMock: vi.fn(() => (modelId: string) => ({ kind: "gateway", modelId })),
  createOpenAIMock: vi.fn((options: { apiKey: string; baseURL?: string }) => {
    return (modelId: string) => ({ kind: "openai", modelId, options });
  }),
  createAnthropicMock: vi.fn((options: { apiKey: string }) => {
    return (modelId: string) => ({ kind: "anthropic", modelId, options });
  }),
  envState: { AI_GATEWAY_API_KEY: "gw-key" as string | undefined },
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    createGateway: createGatewayMock,
  };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicMock,
}));

vi.mock("@/lib/env", () => ({
  env: envState,
}));

import {
  getAgentProviderOptions,
  getManagedLanguageModel,
  hyperlocaliseManagedGatewayModelId,
  isManagedLanguageModelAvailable,
  resolveProviderLanguageModel,
} from "./language-model";

describe("managed language model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.AI_GATEWAY_API_KEY = "gw-key";
  });

  it("uses Vercel AI Gateway when the platform key is configured", () => {
    expect(isManagedLanguageModelAvailable()).toBe(true);
    expect(getManagedLanguageModel()).toEqual({
      kind: "gateway",
      modelId: hyperlocaliseManagedGatewayModelId,
    });
    expect(createGatewayMock).toHaveBeenCalledWith({ apiKey: "gw-key" });
  });

  it("throws when the Gateway key is missing", () => {
    envState.AI_GATEWAY_API_KEY = undefined;
    expect(isManagedLanguageModelAvailable()).toBe(false);
    expect(() => getManagedLanguageModel()).toThrow("AI_GATEWAY_API_KEY is not configured");
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
        model: "gpt-5.6-luna",
      }),
    ).toEqual({
      kind: "openai",
      modelId: "gpt-5.6-luna",
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
      kind: "openai",
      modelId: "gemini-3.5-flash",
      options: {
        apiKey: "gem-key",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      },
    });
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
