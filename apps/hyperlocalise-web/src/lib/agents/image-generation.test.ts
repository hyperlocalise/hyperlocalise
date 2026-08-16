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

const { generateImageMock, getManagedImageModelMock, isManagedLanguageModelAvailableMock } =
  vi.hoisted(() => ({
    generateImageMock: vi.fn(),
    getManagedImageModelMock: vi.fn(() => ({ id: "openai/gpt-image-2" })),
    isManagedLanguageModelAvailableMock: vi.fn(() => true),
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
  isManagedLanguageModelAvailable: isManagedLanguageModelAvailableMock,
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  withAgentRuntimeUsageMetering: vi.fn(async ({ run }: { run: () => Promise<unknown> }) => run()),
}));

import { regenerateImageFromAttachment } from "./image-generation";

describe("image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isManagedLanguageModelAvailableMock.mockReturnValue(true);
    generateImageMock.mockResolvedValue({
      images: [{ uint8Array: new Uint8Array([1, 2, 3]), mediaType: "image/png" }],
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
        model: { id: "openai/gpt-image-2" },
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

  it("requires the managed Gateway key instead of an org BYOK key", async () => {
    isManagedLanguageModelAvailableMock.mockReturnValue(false);

    await expect(
      regenerateImageFromAttachment(Buffer.from("source"), "image/png", "Translate this"),
    ).rejects.toThrow("AI_GATEWAY_API_KEY is not configured");
    expect(getManagedImageModelMock).not.toHaveBeenCalled();
  });
});
