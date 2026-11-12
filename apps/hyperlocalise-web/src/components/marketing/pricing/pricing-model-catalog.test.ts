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

import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";
import { llmProviderContentEditoralog } from "@/lib/providers/shared/catalog";
import { curatedOpenAiNativeModels } from "@/lib/providers/shared/vercel-ai-gateway-openai-models";

import { PRICING_IRIS_MODELS } from "./pricing-iris-models";
import { getPricingCatalogEntries } from "./pricing-model-catalog";

describe("pricing model catalog", () => {
  it("names every supported model once, with the default writer first", () => {
    const entries = getPricingCatalogEntries();
    const modelIds = entries.map((entry) => entry.modelId);

    expect(new Set(modelIds).size).toBe(modelIds.length);
    expect(entries[0]?.modelId).toBe(`openai/${hyperlocaliseAgentModelId}`);
    expect(entries[0]?.highlight).toBe(true);
    expect(entries.filter((entry) => entry.highlight)).toHaveLength(1);

    expect(
      new Set(
        entries
          .filter((entry) => entry.providerId === "openai" && entry.surface === "ai-engine")
          .map((entry) => entry.modelId),
      ),
    ).toEqual(new Set(curatedOpenAiNativeModels.map((slug) => `openai/${slug}`)));

    expect(
      new Set(
        entries.filter((entry) => entry.providerId === "anthropic").map((entry) => entry.modelId),
      ),
    ).toEqual(new Set(llmProviderContentEditoralog.anthropic.models));
    expect(
      new Set(
        entries
          .filter((entry) => entry.providerId === "gemini" && entry.access === "byok")
          .map((entry) => entry.modelId),
      ),
    ).toEqual(new Set(llmProviderContentEditoralog.gemini.models));
    expect(
      entries.filter((entry) => entry.surface === "iris").map((entry) => entry.modelId),
    ).toEqual(expect.arrayContaining(PRICING_IRIS_MODELS.map((model) => model.id)));
    expect(entries.find((entry) => entry.modelId === "veo-3.1")?.job).toBe("video");
    expect(entries.find((entry) => entry.modelId === "image-localise")?.job).toBe("picture");
    expect(entries.find((entry) => entry.modelId === "elevenlabs-sfx")?.job).toBe("sound");

    expect(entries.map((entry) => [entry.modelId, entry.name])).toMatchInlineSnapshot(`
      [
        [
          "openai/gpt-6-luna",
          "GPT-6 Luna",
        ],
        [
          "claude-sonnet-5",
          "Claude Sonnet 5",
        ],
        [
          "nano-banana-2.1",
          "Nano Banana 2.1",
        ],
        [
          "gpt-image-2.6-sunburst",
          "GPT Image 2.6 Sunburst",
        ],
        [
          "image-localise",
          "Image Localise",
        ],
        [
          "veo-3.1",
          "Veo 3.1",
        ],
        [
          "kling-3-pro",
          "Kling 3.0",
        ],
        [
          "seedance-2.5",
          "Seedance 2.5",
        ],
        [
          "sync-lipsync-2",
          "Sync Lipsync 2",
        ],
        [
          "elevenlabs-v4",
          "ElevenLabs v4",
        ],
        [
          "elevenlabs-dubbing",
          "ElevenLabs Dubbing",
        ],
        [
          "elevenlabs-music",
          "ElevenLabs Music",
        ],
        [
          "universal-3.5-pro",
          "Universal 3.5 Pro",
        ],
        [
          "openai/gpt-6.1-sol",
          "GPT-6.1 Sol",
        ],
        [
          "openai/gpt-6.1-sol-fast",
          "GPT-6.1 Sol Fast",
        ],
        [
          "openai/gpt-6-luna-fast",
          "GPT-6 Luna Fast",
        ],
        [
          "openai/gpt-6-astra",
          "GPT-6 Astra",
        ],
        [
          "openai/gpt-6-astra-fast",
          "GPT-6 Astra Fast",
        ],
        [
          "openai/gpt-6-sol",
          "GPT-6 Sol",
        ],
        [
          "openai/gpt-6-sol-fast",
          "GPT-6 Sol Fast",
        ],
        [
          "openai/gpt-5.6-luna",
          "GPT-5.6 Luna",
        ],
        [
          "openai/gpt-5.6-luna-fast",
          "GPT-5.6 Luna Fast",
        ],
        [
          "openai/gpt-5.6-sol",
          "GPT-5.6 Sol",
        ],
        [
          "openai/gpt-5.6-sol-fast",
          "GPT-5.6 Sol Fast",
        ],
        [
          "openai/gpt-5.6-terra",
          "GPT-5.6 Terra",
        ],
        [
          "openai/gpt-5.6-terra-fast",
          "GPT-5.6 Terra Fast",
        ],
        [
          "openai/gpt-5.5",
          "GPT-5.5",
        ],
        [
          "openai/gpt-5.5-fast",
          "GPT-5.5 Fast",
        ],
        [
          "openai/gpt-5.5-pro",
          "GPT-5.5 Pro",
        ],
        [
          "openai/gpt-5.4",
          "GPT-5.4",
        ],
        [
          "openai/gpt-5.4-fast",
          "GPT-5.4 Fast",
        ],
        [
          "openai/gpt-5.4-mini",
          "GPT-5.4 Mini",
        ],
        [
          "openai/gpt-5.4-mini-fast",
          "GPT-5.4 Mini Fast",
        ],
        [
          "openai/gpt-5.4-nano",
          "GPT-5.4 Nano",
        ],
        [
          "openai/gpt-5.4-pro",
          "GPT-5.4 Pro",
        ],
        [
          "nano-banana-pro",
          "Nano Banana Pro",
        ],
        [
          "nano-banana-2",
          "Nano Banana 2",
        ],
        [
          "seedream-5.0-pro",
          "Seedream 5.0 Pro",
        ],
        [
          "flux-3-image",
          "FLUX.3 Image",
        ],
        [
          "flux-2-pro",
          "FLUX.2 Pro",
        ],
        [
          "grok-imagine-image-2.0",
          "Grok Imagine 2.0",
        ],
        [
          "flux-2-klein",
          "FLUX.2 Klein",
        ],
        [
          "krea-2-large",
          "Krea 2 Large",
        ],
        [
          "veo-3.1-fast",
          "Veo 3.1 Fast",
        ],
        [
          "kling-o3-pro",
          "Kling 3.0 Omni",
        ],
        [
          "wan-3.0",
          "Wan 3.0",
        ],
        [
          "minimax-h3",
          "MiniMax H3",
        ],
        [
          "minimax-h3-max",
          "MiniMax H3 Max",
        ],
        [
          "flux-3-video",
          "FLUX.3 Video",
        ],
        [
          "grok-imagine-video-1.5",
          "Grok Imagine Video 1.5",
        ],
        [
          "elevenlabs-v3",
          "ElevenLabs v3",
        ],
        [
          "gemini-3.8-flash-tts",
          "Gemini 3.8 Flash TTS",
        ],
        [
          "elevenlabs-sfx",
          "ElevenLabs SFX",
        ],
        [
          "bria-rmbg-2.0",
          "Bria RMBG 2.0",
        ],
        [
          "seedvr-2",
          "SeedVR 2",
        ],
        [
          "bytedance-upscaler",
          "ByteDance Upscaler",
        ],
        [
          "qwen3.8-omni-flash",
          "Qwen 3.8 Omni Flash",
        ],
        [
          "image-edit",
          "Image Edit",
        ],
        [
          "image-text",
          "Image Text",
        ],
        [
          "claude-opus-5-5",
          "Claude Opus 5.5",
        ],
        [
          "claude-opus-5",
          "Claude Opus 5",
        ],
        [
          "claude-sonnet-4-6",
          "Claude Sonnet 4.6",
        ],
        [
          "claude-opus-4-8",
          "Claude Opus 4.8",
        ],
        [
          "claude-opus-4-7",
          "Claude Opus 4.7",
        ],
        [
          "claude-opus-4-6",
          "Claude Opus 4.6",
        ],
        [
          "claude-haiku-4-5",
          "Claude Haiku 4.5",
        ],
        [
          "claude-sonnet-4-5",
          "Claude Sonnet 4.5",
        ],
        [
          "claude-opus-4-5",
          "Claude Opus 4.5",
        ],
        [
          "gemini-3.8-flash",
          "Gemini 3.8 Flash",
        ],
        [
          "gemini-3.7-flash",
          "Gemini 3.7 Flash",
        ],
        [
          "gemini-3.6-flash",
          "Gemini 3.6 Flash",
        ],
        [
          "gemini-3.5-flash",
          "Gemini 3.5 Flash",
        ],
        [
          "gemini-3.5-flash-lite",
          "Gemini 3.5 Flash Lite",
        ],
        [
          "gemini-3.1-pro-preview",
          "Gemini 3.1 Pro Preview",
        ],
        [
          "gemini-3.1-flash-lite",
          "Gemini 3.1 Flash Lite",
        ],
        [
          "gemini-3-flash",
          "Gemini 3 Flash",
        ],
        [
          "gemini-3-pro-preview",
          "Gemini 3 Pro Preview",
        ],
        [
          "gemini-2.5-pro",
          "Gemini 2.5 Pro",
        ],
        [
          "gemini-2.5-flash",
          "Gemini 2.5 Flash",
        ],
        [
          "gemini-2.5-flash-lite",
          "Gemini 2.5 Flash Lite",
        ],
      ]
    `);
  });
});
