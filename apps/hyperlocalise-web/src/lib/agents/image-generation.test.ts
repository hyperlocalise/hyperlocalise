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

const {
  generateImageMock,
  getManagedImageModelMock,
  getManagedAiPricingConfigMock,
  reserveManagedAiCreditMock,
  settleManagedAiCreditMock,
  releaseManagedAiCreditMock,
} = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  getManagedImageModelMock: vi.fn(() => "openai/gpt-image-2"),
  getManagedAiPricingConfigMock: vi.fn(),
  reserveManagedAiCreditMock: vi.fn(),
  settleManagedAiCreditMock: vi.fn(),
  releaseManagedAiCreditMock: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateImage: generateImageMock,
  };
});

vi.mock("@/lib/providers/language-model", () => ({
  getManagedImageModel: getManagedImageModelMock,
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  withAgentRuntimeUsageMetering: vi.fn(async ({ run }: { run: () => Promise<unknown> }) => run()),
}));

vi.mock("@/lib/billing/managed-ai-pricing", () => ({
  getManagedAiPricingConfig: getManagedAiPricingConfigMock,
  managedAiReservationAmountUsd: vi.fn(
    (config: { imagePriceUsd?: number }) => config.imagePriceUsd ?? null,
  ),
}));

vi.mock("@/lib/billing/managed-ai-credit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/managed-ai-credit")>(
    "@/lib/billing/managed-ai-credit",
  );
  return {
    ...actual,
    reserveManagedAiCredit: reserveManagedAiCreditMock,
    settleManagedAiCredit: settleManagedAiCreditMock,
    releaseManagedAiCredit: releaseManagedAiCreditMock,
  };
});

import { regenerateImageFromAttachment } from "./image-generation";

describe("image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "legacy",
      pricingVersion: "test",
      imagePriceUsd: 0.25,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
    reserveManagedAiCreditMock.mockResolvedValue({
      ok: true,
      value: {
        operationKey: "image:test:ai_tokens",
        mode: "shadow",
        credentialSource: "gateway",
        estimatedAmountUsd: 0.25,
      },
    });
    settleManagedAiCreditMock.mockResolvedValue({
      ok: true,
      value: { amountUsd: 0.25, status: "settled" },
    });
    releaseManagedAiCreditMock.mockResolvedValue({ ok: true, value: undefined });
    generateImageMock.mockResolvedValue({
      images: [{ uint8Array: new Uint8Array([1, 2, 3]), mediaType: "image/png" }],
      providerMetadata: { gateway: { generationId: "gen_image" } },
    });
  });

  it("generates localized images through the managed OpenAI Gateway model", async () => {
    const result = await regenerateImageFromAttachment(
      Buffer.from("source"),
      "image/png",
      "Localize this screenshot into Japanese",
    );

    expect(getManagedImageModelMock).toHaveBeenCalledOnce();
    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-image-2",
        prompt: {
          images: [Buffer.from("source")],
          text: "Localize this screenshot into Japanese",
        },
      }),
    );
    expect(result).toEqual({
      image: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
      prompt: "Localize this screenshot into Japanese",
    });
  });

  it("reserves and settles one synthetic image unit", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "shadow",
      pricingVersion: "test",
      imagePriceUsd: 0.25,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });

    await regenerateImageFromAttachment(
      Buffer.from("source"),
      "image/png",
      "Localize this screenshot",
      {
        organizationId: "org_123",
        operationKey: "image:test",
      },
    );

    expect(reserveManagedAiCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "image:test:ai_tokens",
        modelId: "custom/image",
        estimatedAmountUsd: 0.25,
      }),
    );
    expect(settleManagedAiCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "custom/image",
        providerGenerationId: "gen_image",
        shadowAmountUsd: 0.25,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 1,
          totalTokens: 1,
        },
      }),
    );
  });
});
