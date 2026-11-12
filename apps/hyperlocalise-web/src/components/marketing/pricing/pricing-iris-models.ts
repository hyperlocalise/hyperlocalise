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

/**
 * The models Iris can run, as the pricing page shows them.
 *
 * Mirrors the registry in `apps/go-svc/iris-generation-models.go`, which is the source
 * of truth. `pricing-iris-models.test.ts` fails when an id or name drifts from it.
 */

export type PricingIrisVendorId =
  | "google"
  | "openai"
  | "bytedance"
  | "black-forest-labs"
  | "xai"
  | "krea"
  | "kuaishou"
  | "alibaba"
  | "minimax"
  | "elevenlabs"
  | "bria"
  | "sync"
  | "hyperlocalise";

/** Brand names stay in English. */
export const pricingIrisVendorNames: Record<PricingIrisVendorId, string> = {
  google: "Google",
  openai: "OpenAI",
  bytedance: "ByteDance",
  "black-forest-labs": "Black Forest Labs",
  xai: "xAI",
  krea: "Krea",
  kuaishou: "Kling AI",
  alibaba: "Alibaba",
  minimax: "MiniMax",
  elevenlabs: "ElevenLabs",
  bria: "Bria",
  sync: "Sync Labs",
  hyperlocalise: "Hyperlocalise",
};

/** Shared plain-language copy for a group of Iris models. */
export type PricingIrisCopyGroup =
  | "image"
  | "image-tool"
  | "image-localise"
  | "video"
  | "video-tool"
  | "voice"
  | "dubbing"
  | "sound"
  | "listen";

export type PricingIrisJob = "picture" | "video" | "speak" | "sound" | "listen";

export type PricingIrisModel = {
  id: string;
  name: string;
  vendor: PricingIrisVendorId;
  job: PricingIrisJob;
  group: PricingIrisCopyGroup;
};

const groupJobs: Record<PricingIrisCopyGroup, PricingIrisJob> = {
  image: "picture",
  "image-tool": "picture",
  "image-localise": "picture",
  video: "video",
  "video-tool": "video",
  voice: "speak",
  dubbing: "speak",
  sound: "sound",
  listen: "listen",
};

function model(
  id: string,
  name: string,
  vendor: PricingIrisVendorId,
  group: PricingIrisCopyGroup,
): PricingIrisModel {
  return { id, name, vendor, group, job: groupJobs[group] };
}

/** In the same order as the go-svc registry. */
export const PRICING_IRIS_MODELS: readonly PricingIrisModel[] = [
  model("nano-banana-2.1", "Nano Banana 2.1", "google", "image"),
  model("nano-banana-pro", "Nano Banana Pro", "google", "image"),
  model("gpt-image-2.6-sunburst", "GPT Image 2.6 Sunburst", "openai", "image"),
  model("nano-banana-2", "Nano Banana 2", "google", "image"),
  model("seedream-5.0-pro", "Seedream 5.0 Pro", "bytedance", "image"),
  model("flux-3-image", "FLUX.3 Image", "black-forest-labs", "image"),
  model("flux-2-pro", "FLUX.2 Pro", "black-forest-labs", "image"),
  model("grok-imagine-image-2.0", "Grok Imagine 2.0", "xai", "image"),
  model("flux-2-klein", "FLUX.2 Klein", "black-forest-labs", "image"),
  model("krea-2-large", "Krea 2 Large", "krea", "image"),
  model("veo-3.1", "Veo 3.1", "google", "video"),
  model("veo-3.1-fast", "Veo 3.1 Fast", "google", "video"),
  model("kling-3-pro", "Kling 3.0", "kuaishou", "video"),
  model("kling-o3-pro", "Kling 3.0 Omni", "kuaishou", "video"),
  model("seedance-2.5", "Seedance 2.5", "bytedance", "video"),
  model("wan-3.0", "Wan 3.0", "alibaba", "video"),
  model("minimax-h3", "MiniMax H3", "minimax", "video"),
  model("minimax-h3-max", "MiniMax H3 Max", "minimax", "video"),
  model("flux-3-video", "FLUX.3 Video", "black-forest-labs", "video"),
  model("grok-imagine-video-1.5", "Grok Imagine Video 1.5", "xai", "video"),
  model("elevenlabs-v4", "ElevenLabs v4", "elevenlabs", "voice"),
  model("elevenlabs-v3", "ElevenLabs v3", "elevenlabs", "voice"),
  model("gemini-3.8-flash-tts", "Gemini 3.8 Flash TTS", "google", "voice"),
  model("elevenlabs-music", "ElevenLabs Music", "elevenlabs", "sound"),
  model("elevenlabs-sfx", "ElevenLabs SFX", "elevenlabs", "sound"),
  model("bria-rmbg-2.0", "Bria RMBG 2.0", "bria", "image-tool"),
  model("seedvr-2", "SeedVR 2", "bytedance", "image-tool"),
  model("bytedance-upscaler", "ByteDance Upscaler", "bytedance", "video-tool"),
  model("universal-3.5-pro", "Universal 3.5 Pro", "google", "listen"),
  model("qwen3.8-omni-flash", "Qwen 3.8 Omni Flash", "alibaba", "listen"),
  model("elevenlabs-dubbing", "ElevenLabs Dubbing", "elevenlabs", "dubbing"),
  model("sync-lipsync-2", "Sync Lipsync 2", "sync", "video-tool"),
  model("image-localise", "Image Localise", "hyperlocalise", "image-localise"),
  model("image-edit", "Image Edit", "hyperlocalise", "image-localise"),
  model("image-text", "Image Text", "hyperlocalise", "image-localise"),
];

export type PricingIrisModelId = (typeof PRICING_IRIS_MODELS)[number]["id"];
