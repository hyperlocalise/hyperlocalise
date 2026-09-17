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

const { generateImageMock, getManagedImageModelMock, withAgentRuntimeUsageMeteringMock } =
  vi.hoisted(() => ({
    generateImageMock: vi.fn(),
    getManagedImageModelMock: vi.fn(() => "openai/gpt-image-2.5-flare"),
    withAgentRuntimeUsageMeteringMock: vi.fn(
      async ({ run }: { run: () => Promise<unknown> }) => run(),
    ),
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
  hyperlocaliseImageModelId: "openai/gpt-image-2",
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  withAgentRuntimeUsageMetering: withAgentRuntimeUsageMeteringMock,
}));

vi.mock("@/lib/billing/managed-ai-pricing", () => ({
  getManagedAiPricingConfig: () => ({
    pricingVersion: "test",
    imageModelId: "custom/image",
    videoModelId: "custom/video",
  }),
}));

import { regenerateImageFromAttachment } from "./image-generation";

describe("image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        model: "openai/gpt-image-2.5-flare",
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

  it("tracks a synthetic image unit after generation when the provider reports no tokens", async () => {
    await regenerateImageFromAttachment(
      Buffer.from("source"),
      "image/png",
      "Localize this screenshot",
      {
        organizationId: "org_123",
        operationKey: "image:test",
      },
    );

    expect(withAgentRuntimeUsageMeteringMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "image:test",
        aiCreditCredentialSource: "gateway",
      }),
    );
    const metering = withAgentRuntimeUsageMeteringMock.mock.calls[0][0] as {
      extractTokenUsage: (result: {
        billing: { tokenUsage: unknown; imageCount: number };
      }) => unknown;
      aiCreditModelId: (result: { billing: { tokenUsage: unknown } }) => string;
    };
    const generated = {
      billing: { tokenUsage: null, imageCount: 1 },
    };
    expect(metering.extractTokenUsage(generated)).toEqual({
      inputTokens: 0,
      outputTokens: 1,
      totalTokens: 1,
    });
    expect(metering.aiCreditModelId(generated)).toBe("custom/image");
  });

  it("tracks reported image token usage after generation", async () => {
    generateImageMock.mockResolvedValueOnce({
      images: [{ uint8Array: new Uint8Array([1, 2, 3]), mediaType: "image/png" }],
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      providerMetadata: { gateway: { generationId: "gen_image" } },
    });

    await regenerateImageFromAttachment(
      Buffer.from("source"),
      "image/png",
      "Localize this screenshot",
      {
        organizationId: "org_123",
        operationKey: "image:tokens",
      },
    );

    const metering = withAgentRuntimeUsageMeteringMock.mock.calls[0][0] as {
      run: () => Promise<{ billing: { tokenUsage: unknown } }>;
      extractTokenUsage: (result: { billing: { tokenUsage: unknown } }) => unknown;
      aiCreditModelId: (result: { billing: { tokenUsage: unknown } }) => string;
    };
    const generated = await metering.run();
    expect(metering.extractTokenUsage(generated)).toEqual({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
    });
    expect(metering.aiCreditModelId(generated)).toBe("openai/gpt-image-2");
  });

  it("does not complete image tracking when generation fails", async () => {
    generateImageMock.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(
      regenerateImageFromAttachment(
        Buffer.from("source"),
        "image/png",
        "Localize this screenshot",
        {
          organizationId: "org_123",
          operationKey: "image:test",
        },
      ),
    ).rejects.toThrow("provider unavailable");
  });
});
