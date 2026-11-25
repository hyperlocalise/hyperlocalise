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
import { llmProviderContentEditoralog } from "@/lib/providers/shared/catalog";
import { toVercelAiGatewayModelId } from "@/lib/providers/shared/vercel-ai-gateway-model-id";

/** Anthropic writer models on Vercel AI Gateway (included / monthly AI credit). */
export const curatedAnthropicGatewayWriterModelIds =
  llmProviderContentEditoralog.anthropic.models.map((model) =>
    toVercelAiGatewayModelId({ provider: "anthropic", model }),
  );

/** Google Gemini writer models on Vercel AI Gateway (included / monthly AI credit). */
export const curatedGeminiGatewayWriterModelIds = llmProviderContentEditoralog.gemini.models.map(
  (model) => toVercelAiGatewayModelId({ provider: "gemini", model }),
);
