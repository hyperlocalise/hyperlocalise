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
  generateVideoMock,
  getManagedVideoModelMock,
  getManagedAiPricingConfigMock,
  reserveManagedAiCreditMock,
  settleManagedAiCreditMock,
  releaseManagedAiCreditMock,
} = vi.hoisted(() => ({
  generateVideoMock: vi.fn(),
  getManagedVideoModelMock: vi.fn(() => "bytedance/seedance-2.5"),
  getManagedAiPricingConfigMock: vi.fn(),
  reserveManagedAiCreditMock: vi.fn(),
  settleManagedAiCreditMock: vi.fn(),
  releaseManagedAiCreditMock: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    experimental_generateVideo: generateVideoMock,
  };
});

vi.mock("@/lib/providers/language-model", () => ({
  getManagedVideoModel: getManagedVideoModelMock,
  hyperlocaliseVideoModelId: "bytedance/seedance-2.5",
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  withAgentRuntimeUsageMetering: vi.fn(async ({ run }: { run: () => Promise<unknown> }) => run()),
}));

vi.mock("@/lib/billing/managed-ai-pricing", () => ({
  getManagedAiPricingConfig: getManagedAiPricingConfigMock,
  managedAiReservationAmountUsd: vi.fn(
    (config: { videoPriceUsdPerSecond?: number }, input: { durationSeconds: number }) =>
      config.videoPriceUsdPerSecond == null
        ? null
        : config.videoPriceUsdPerSecond * input.durationSeconds,
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

import { regenerateVideoFromAttachment } from "./video-generation";

describe("video generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "legacy",
      pricingVersion: "test",
      videoPriceUsdPerSecond: 0.4,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
    reserveManagedAiCreditMock.mockResolvedValue({
      ok: true,
      value: {
        operationKey: "video:test:ai_tokens",
        mode: "shadow",
        credentialSource: "gateway",
        estimatedAmountUsd: 2,
      },
    });
    settleManagedAiCreditMock.mockResolvedValue({
      ok: true,
      value: { amountUsd: 2, status: "settled" },
    });
    releaseManagedAiCreditMock.mockResolvedValue({ ok: true, value: undefined });
    generateVideoMock.mockResolvedValue({
      video: { uint8Array: new Uint8Array([9, 8, 7]), mediaType: "video/mp4" },
      providerMetadata: { gateway: { asyncJob: { jobId: "job_video" } } },
    });
  });

  it("generates localized videos through the managed Seedance Gateway model", async () => {
    const result = await regenerateVideoFromAttachment(
      Buffer.from("source-video"),
      "video/mp4",
      "Localize this clip into Spanish",
    );

    expect(getManagedVideoModelMock).toHaveBeenCalledOnce();
    expect(generateVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "bytedance/seedance-2.5",
        prompt: "Localize this clip into Spanish",
        duration: 5,
        generateAudio: true,
        providerOptions: {
          bytedance: {
            pollTimeoutMs: 600_000,
          },
        },
      }),
    );
    expect(result).toEqual({
      video: Buffer.from([9, 8, 7]),
      mimeType: "video/mp4",
      prompt: "Localize this clip into Spanish",
    });
  });

  it("reserves and settles synthetic video-second units", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "shadow",
      pricingVersion: "test",
      videoPriceUsdPerSecond: 0.4,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });

    await regenerateVideoFromAttachment(
      Buffer.from("source-video"),
      "video/mp4",
      "Localize this clip",
      {
        organizationId: "org_123",
        operationKey: "video:test",
      },
      8,
    );

    expect(reserveManagedAiCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "video:test:ai_tokens",
        modelId: "custom/video",
        estimatedAmountUsd: 3.2,
      }),
    );
    expect(settleManagedAiCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "custom/video",
        providerGenerationId: "job_video",
        shadowAmountUsd: 3.2,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 8,
          totalTokens: 8,
        },
      }),
    );
  });

  it("releases the video reservation when generation fails", async () => {
    getManagedAiPricingConfigMock.mockReturnValue({
      mode: "shadow",
      pricingVersion: "test",
      videoPriceUsdPerSecond: 0.4,
      imageModelId: "custom/image",
      videoModelId: "custom/video",
    });
    generateVideoMock.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(
      regenerateVideoFromAttachment(
        Buffer.from("source-video"),
        "video/mp4",
        "Localize this clip",
        {
          organizationId: "org_123",
          operationKey: "video:test",
        },
        8,
      ),
    ).rejects.toThrow("provider unavailable");

    expect(releaseManagedAiCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "video_generation_failed",
      }),
    );
    expect(settleManagedAiCreditMock).not.toHaveBeenCalled();
  });
});
