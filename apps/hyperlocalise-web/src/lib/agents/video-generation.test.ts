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

const { generateVideoMock, getManagedVideoModelMock, withAgentRuntimeUsageMeteringMock } =
  vi.hoisted(() => ({
    generateVideoMock: vi.fn(),
    getManagedVideoModelMock: vi.fn(() => "bytedance/seedance-2.5"),
    withAgentRuntimeUsageMeteringMock: vi.fn(async ({ run }: { run: () => Promise<unknown> }) =>
      run(),
    ),
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
  withAgentRuntimeUsageMetering: withAgentRuntimeUsageMeteringMock,
}));

vi.mock("@/lib/billing/managed-ai-pricing", () => ({
  getManagedAiPricingConfig: () => ({
    pricingVersion: "test",
    imageModelId: "custom/image",
    videoModelId: "custom/video",
  }),
}));

import { regenerateVideoFromAttachment } from "./video-generation";

describe("video generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("tracks synthetic video-second units after generation", async () => {
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

    expect(withAgentRuntimeUsageMeteringMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "video:test",
        aiCreditModelId: "custom/video",
        aiCreditCredentialSource: "gateway",
      }),
    );
    const metering = withAgentRuntimeUsageMeteringMock.mock.calls[0][0] as unknown as {
      extractTokenUsage: (result: { billing: { durationSeconds: number } }) => unknown;
    };
    expect(metering.extractTokenUsage({ billing: { durationSeconds: 8 } })).toEqual({
      inputTokens: 0,
      outputTokens: 8,
      totalTokens: 8,
    });
  });

  it("does not complete video tracking when generation fails", async () => {
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
  });
});
