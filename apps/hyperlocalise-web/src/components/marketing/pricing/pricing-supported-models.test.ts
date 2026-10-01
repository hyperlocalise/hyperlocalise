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
import { curatedOpenAiNativeModels } from "@/lib/providers/shared/vercel-ai-gateway-openai-models";

import {
  getPricingByokProviderModelIds,
  pricingByokProviderIds,
  pricingManagedAgentGatewayModelIds,
} from "./pricing-supported-models";

describe("pricing-supported-models", () => {
  it("maps managed agent models to OpenAI gateway ids", () => {
    expect(pricingManagedAgentGatewayModelIds).toEqual(
      curatedOpenAiNativeModels.map((slug) => `openai/${slug}`),
    );
  });

  it("reuses the BYOK catalog for pricing providers", () => {
    for (const providerId of pricingByokProviderIds) {
      expect(getPricingByokProviderModelIds(providerId)).toEqual(
        llmProviderContentEditoralog[providerId].models,
      );
    }
  });
});
