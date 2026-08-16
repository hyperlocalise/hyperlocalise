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

const { generateVideoMock, getManagedVideoModelMock, isManagedLanguageModelAvailableMock } =
  vi.hoisted(() => ({
    generateVideoMock: vi.fn(),
    getManagedVideoModelMock: vi.fn(() => ({ id: "google/gemini-omni-flash-preview" })),
    isManagedLanguageModelAvailableMock: vi.fn(() => true),
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
  isManagedLanguageModelAvailable: isManagedLanguageModelAvailableMock,
  hyperlocaliseVideoModelId: "google/gemini-omni-flash-preview",
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  withAgentRuntimeUsageMetering: vi.fn(async ({ run }: { run: () => Promise<unknown> }) => run()),
}));

import { regenerateVideoFromAttachment, VideoLocalizationError } from "./video-generation";

describe("video generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isManagedLanguageModelAvailableMock.mockReturnValue(true);
    generateVideoMock.mockResolvedValue({
      video: { uint8Array: new Uint8Array([9, 8, 7]), mediaType: "video/mp4" },
    });
  });

  it("generates localized videos through the managed Omni Gateway model", async () => {
    const result = await regenerateVideoFromAttachment(
      Buffer.from("source-video"),
      "video/mp4",
      "Localize this clip into Spanish",
    );

    expect(getManagedVideoModelMock).toHaveBeenCalledOnce();
    expect(generateVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { id: "google/gemini-omni-flash-preview" },
        prompt: "Localize this clip into Spanish",
      }),
    );
    expect(result).toEqual({
      video: Buffer.from([9, 8, 7]),
      mimeType: "video/mp4",
      prompt: "Localize this clip into Spanish",
    });
  });

  it("requires the managed Gateway key instead of an org BYOK key", async () => {
    isManagedLanguageModelAvailableMock.mockReturnValue(false);

    await expect(
      regenerateVideoFromAttachment(Buffer.from("source-video"), "video/mp4", "Translate this"),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "VideoLocalizationError",
        code: "video_model_unavailable",
        message: "AI_GATEWAY_API_KEY is not configured",
      }),
    );
    expect(getManagedVideoModelMock).not.toHaveBeenCalled();
    expect(VideoLocalizationError).toBeDefined();
  });
});
