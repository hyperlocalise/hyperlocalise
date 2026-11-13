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

import {
  buildCuratedOpenAiNativeModelsForTest,
  buildOpenAiWorkspaceAutomationGatewayModelsForTest,
  curatedOpenAiNativeModels,
  OPENAI_WORKSPACE_AUTOMATION_GATEWAY_MODELS,
} from "@/lib/providers/shared/vercel-ai-gateway-openai-models";

describe("vercel-ai-gateway-openai-models", () => {
  it("includes GPT-6.1 Sol and fast variants for supported OpenAI gateway models", () => {
    expect(curatedOpenAiNativeModels).toEqual(buildCuratedOpenAiNativeModelsForTest());
    expect(curatedOpenAiNativeModels).toEqual([
      "gpt-6.1-sol",
      "gpt-6.1-sol-fast",
      "gpt-6-luna",
      "gpt-6-luna-fast",
      "gpt-6-astra",
      "gpt-6-astra-fast",
      "gpt-6-sol",
      "gpt-6-sol-fast",
      "gpt-5.6-luna",
      "gpt-5.6-luna-fast",
      "gpt-5.6-sol",
      "gpt-5.6-sol-fast",
      "gpt-5.6-terra",
      "gpt-5.6-terra-fast",
      "gpt-5.5",
      "gpt-5.5-fast",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-fast",
      "gpt-5.4-mini",
      "gpt-5.4-mini-fast",
      "gpt-5.4-nano",
      "gpt-5.4-pro",
    ]);
  });

  it("lists automation OpenAI gateway models with fast variants", () => {
    expect(OPENAI_WORKSPACE_AUTOMATION_GATEWAY_MODELS).toEqual(
      buildOpenAiWorkspaceAutomationGatewayModelsForTest(),
    );
    expect(OPENAI_WORKSPACE_AUTOMATION_GATEWAY_MODELS).toEqual([
      "openai/gpt-6.1-sol",
      "openai/gpt-6.1-sol-fast",
      "openai/gpt-6-luna",
      "openai/gpt-6-luna-fast",
      "openai/gpt-6-astra",
      "openai/gpt-6-astra-fast",
      "openai/gpt-6-sol",
      "openai/gpt-6-sol-fast",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-terra-fast",
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-sol-fast",
    ]);
  });
});
