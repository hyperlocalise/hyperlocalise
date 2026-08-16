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
import { describe, expect, it } from "vite-plus/test";

import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";

import { resolveSandboxLlmProfile, resolveSandboxTranslationEnv } from "./sandbox-llm";

describe("resolveSandboxTranslationEnv", () => {
  it("passes OpenAI when only that key is set", () => {
    expect(resolveSandboxTranslationEnv({ OPENAI_API_KEY: "sk-openai" })).toEqual({
      OPENAI_API_KEY: "sk-openai",
    });
  });

  it("passes the AI Gateway key when that env var is set", () => {
    expect(resolveSandboxTranslationEnv({ AI_GATEWAY_API_KEY: "vck_test" })).toEqual({
      AI_GATEWAY_API_KEY: "vck_test",
    });
  });

  it("passes both keys and an optional Gateway base URL when present", () => {
    expect(
      resolveSandboxTranslationEnv({
        OPENAI_API_KEY: "sk-openai",
        AI_GATEWAY_API_KEY: "vck_test",
        AI_GATEWAY_BASE_URL: "https://ai-gateway.example.test/v1",
      }),
    ).toEqual({
      OPENAI_API_KEY: "sk-openai",
      AI_GATEWAY_API_KEY: "vck_test",
      AI_GATEWAY_BASE_URL: "https://ai-gateway.example.test/v1",
    });
  });

  it("ignores blank Gateway values", () => {
    expect(
      resolveSandboxTranslationEnv({
        OPENAI_API_KEY: "sk-openai",
        AI_GATEWAY_API_KEY: "   ",
        AI_GATEWAY_BASE_URL: "",
      }),
    ).toEqual({
      OPENAI_API_KEY: "sk-openai",
    });
  });

  it("requires OpenAI or AI Gateway credentials", () => {
    expect(() => resolveSandboxTranslationEnv({})).toThrow(
      "OPENAI_API_KEY or AI_GATEWAY_API_KEY is not configured",
    );
  });

  it("passes only the BYOK provider key when an organization credential is present", () => {
    expect(
      resolveSandboxTranslationEnv(
        {
          OPENAI_API_KEY: "sk-platform",
          AI_GATEWAY_API_KEY: "vck_platform",
        },
        {
          provider: "anthropic",
          apiKey: "sk-ant-org",
          model: "claude-sonnet-4-6",
        },
      ),
    ).toEqual({
      ANTHROPIC_API_KEY: "sk-ant-org",
    });
  });
});

describe("resolveSandboxLlmProfile", () => {
  it("uses ai_gateway and the managed Gateway model when the key is set", () => {
    expect(resolveSandboxLlmProfile({ AI_GATEWAY_API_KEY: "vck_test" })).toEqual({
      provider: "ai_gateway",
      model: `openai/${hyperlocaliseAgentModelId}`,
    });
  });

  it("keeps the OpenAI profile when only OPENAI_API_KEY is set", () => {
    expect(resolveSandboxLlmProfile({ OPENAI_API_KEY: "sk-openai" })).toEqual({
      provider: "openai",
      model: hyperlocaliseAgentModelId,
    });
  });

  it("uses the organization BYOK provider and model when a credential is present", () => {
    expect(
      resolveSandboxLlmProfile(
        { AI_GATEWAY_API_KEY: "vck_test" },
        {
          provider: "gemini",
          apiKey: "gem-org",
          model: "gemini-3.5-flash",
        },
      ),
    ).toEqual({
      provider: "gemini",
      model: "gemini-3.5-flash",
    });
  });
});
