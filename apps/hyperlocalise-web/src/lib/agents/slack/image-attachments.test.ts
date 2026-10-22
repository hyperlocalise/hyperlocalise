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

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: generateTextMock,
}));

import { interpretSlackImageRequest } from "./image-attachments";

describe("interpretSlackImageRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the request with the model it is given", async () => {
    const ownModel = { modelId: "claude-sonnet-5" };
    generateTextMock.mockResolvedValueOnce({
      output: { targetLocale: "ja", instructions: null, confidence: 0.9, missingFields: [] },
    });

    const intent = await interpretSlackImageRequest(
      { text: "Make this Japanese" },
      {
        languageModel: {
          model: ownModel as never,
          source: "anthropic",
          modelId: "anthropic/claude-sonnet-5",
        },
      },
    );

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ model: ownModel }));
    expect(intent.targetLocale).toBe("ja");
  });

  it("still throws when Hyperlocalise's model fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("gateway unavailable"));

    await expect(
      interpretSlackImageRequest(
        { text: "Make this Japanese" },
        {
          languageModel: {
            model: "openai/gpt-6-luna",
            source: "gateway",
            modelId: "openai/gpt-6-luna",
          },
        },
      ),
    ).rejects.toThrow("gateway unavailable");
  });

  it("returns no target locale when the workspace's own model fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("response_format is not supported"));

    await expect(
      interpretSlackImageRequest(
        { text: "Make this Japanese" },
        {
          languageModel: {
            model: { modelId: "mistral-small-latest" } as never,
            source: "mistral",
            modelId: "mistral/mistral-small-latest",
          },
        },
      ),
    ).resolves.toEqual({
      targetLocale: null,
      instructions: null,
      confidence: 0,
      missingFields: ["targetLocale"],
    });
  });
});
