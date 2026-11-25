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

import { llmProviderContentEditoralog } from "@/lib/providers/shared/catalog";

import { toVercelAiGatewayModelId } from "@/lib/providers/shared/vercel-ai-gateway-model-id";

import {
  curatedAnthropicGatewayWriterModelIds,
  curatedGeminiGatewayWriterModelIds,
} from "./vercel-ai-gateway-managed-writer-models";

describe("vercel-ai-gateway-managed-writer-models", () => {
  it("maps Anthropic and Gemini BYOK ids to gateway writer model ids", () => {
    expect(curatedAnthropicGatewayWriterModelIds).toEqual(
      llmProviderContentEditoralog.anthropic.models.map((model) =>
        toVercelAiGatewayModelId({ provider: "anthropic", model }),
      ),
    );
    expect(curatedGeminiGatewayWriterModelIds).toEqual(
      llmProviderContentEditoralog.gemini.models.map((model) =>
        toVercelAiGatewayModelId({ provider: "gemini", model }),
      ),
    );
    expect(curatedAnthropicGatewayWriterModelIds[0]).toBe("anthropic/claude-opus-5.5");
    expect(curatedGeminiGatewayWriterModelIds[0]).toBe("google/gemini-4-neon");
  });
});
