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
import type { IntlShape } from "@formatjs/intl";

import type { PricingIrisCopyGroup, PricingIrisModelId } from "./pricing-iris-models";

export type PricingIrisGroupCopy = { story: string; useWhen: string };

/** Shared story and situation for each group of Iris models. */
export function getPricingIrisGroupCopy(
  intl: IntlShape,
): Record<PricingIrisCopyGroup, PricingIrisGroupCopy> {
  return {
    image: {
      story: intl.formatMessage({
        defaultMessage:
          "Make campaign images in Iris from a brief or a reference picture. Pick the model whose style fits, then localise the result for each market. Usage comes out of your monthly AI credit.",
        id: "A83QwAGhC6",
        description: "Story for Iris image generation models on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You need a new visual for a campaign or a market.",
        id: "riJZSqihrB",
        description: "Situation for Iris image generation models on the pricing page",
      }),
    },
    "image-tool": {
      story: intl.formatMessage({
        defaultMessage:
          "Clean up a picture before it ships. Remove a background or sharpen a small image in one step on the Iris canvas.",
        id: "gNQMgRK+w9",
        description:
          "Story for Iris image tools (background removal, upscaling) on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "An image is almost right but needs a cut-out or more detail.",
        id: "R2E1/A87hi",
        description: "Situation for Iris image tools on the pricing page",
      }),
    },
    "image-localise": {
      story: intl.formatMessage({
        defaultMessage:
          "Iris reads the copy baked into an image, translates it with your glossary and translation memory, and redraws it in place. Edit any area of a picture with a short instruction.",
        id: "OlWT3zl2O8",
        description: "Story for Iris image localisation tools on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "A banner or screenshot has text that must change per locale.",
        id: "qen7eE/t1H",
        description: "Situation for Iris image localisation tools on the pricing page",
      }),
    },
    video: {
      story: intl.formatMessage({
        defaultMessage:
          "Turn a brief, a still, or a start and end frame into a short clip in Iris. Then subtitle, dub, and check it for every locale in the same project.",
        id: "ZlYASzr31X",
        description: "Story for Iris video generation models on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "A still image is not enough for the campaign.",
        id: "f45fdRyrBr",
        description: "Situation for Iris video generation models on the pricing page",
      }),
    },
    "video-tool": {
      story: intl.formatMessage({
        defaultMessage:
          "Finish a localised video in Iris. Upscale footage, or re-time a speaker's lips to the new language so the dub looks natural.",
        id: "TS5xLIAyN5",
        description: "Story for Iris video tools (upscaling, lip-sync) on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "A localised cut needs to look as good as the original.",
        id: "74efu3oueY",
        description: "Situation for Iris video tools on the pricing page",
      }),
    },
    voice: {
      story: intl.formatMessage({
        defaultMessage:
          "Give a script a voice in Iris. Choose a voice, hear a preview, and place the line straight on the timeline.",
        id: "gGk72zH7oe",
        description: "Story for Iris voice (text-to-speech) models on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You need a voice-over in a new language.",
        id: "cObYw5PnTj",
        description: "Situation for Iris voice models on the pricing page",
      }),
    },
    dubbing: {
      story: intl.formatMessage({
        defaultMessage:
          "Dub a video into another language and keep each speaker's own voice. Iris separates up to nine speakers and lines the new audio up with the cut.",
        id: "fsQLLi+dCQ",
        description: "Story for the Iris dubbing model on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "People on screen should sound like themselves in every market.",
        id: "n+AIAUMlWH",
        description: "Situation for the Iris dubbing model on the pricing page",
      }),
    },
    sound: {
      story: intl.formatMessage({
        defaultMessage:
          "Score a clip or add sound effects from a short description, without leaving the Iris timeline.",
        id: "kDjV6WPg42",
        description: "Story for Iris music and sound effect models on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "A video needs music or sound that fits the local cut.",
        id: "n+3XFK8STI",
        description: "Situation for Iris music and sound effect models on the pricing page",
      }),
    },
    listen: {
      story: intl.formatMessage({
        defaultMessage:
          "Iris transcribes speech for captions and subtitles, and can describe what happens in a clip so you can find a moment fast.",
        id: "xT56xHEVrR",
        description:
          "Story for Iris transcription and media understanding models on the pricing page",
      }),
      useWhen: intl.formatMessage({
        defaultMessage: "You need captions, a transcript, or a summary of footage.",
        id: "BsjNKJYjjz",
        description: "Situation for Iris transcription models on the pricing page",
      }),
    },
  };
}

/** One short line per Iris model, shown on its card. */
export function getPricingIrisModelSummaries(intl: IntlShape): Record<PricingIrisModelId, string> {
  return {
    "nano-banana-2.1": intl.formatMessage({
      defaultMessage: "Sharp images up to 4K",
      id: "JJcwSISxif",
      description: "Card summary for the Nano Banana 2.1 image model on the pricing page",
    }),
    "nano-banana-pro": intl.formatMessage({
      defaultMessage: "Detailed images that follow the brief",
      id: "55i6amXT6x",
      description: "Card summary for the Nano Banana Pro image model on the pricing page",
    }),
    "gpt-image-2.6-sunburst": intl.formatMessage({
      defaultMessage: "Images with clean, readable text",
      id: "gDctOAs44P",
      description: "Card summary for the GPT Image 2.6 Sunburst image model on the pricing page",
    }),
    "nano-banana-2": intl.formatMessage({
      defaultMessage: "Fast, low-cost images",
      id: "VGcJbowtpZ",
      description: "Card summary for the Nano Banana 2 image model on the pricing page",
    }),
    "seedream-5.0-pro": intl.formatMessage({
      defaultMessage: "Polished product and lifestyle shots",
      id: "yk3F4PfHvt",
      description: "Card summary for the Seedream 5.0 Pro image model on the pricing page",
    }),
    "flux-3-image": intl.formatMessage({
      defaultMessage: "Photoreal images up to 4K",
      id: "NZeWaBrCtn",
      description: "Card summary for the FLUX.3 Image model on the pricing page",
    }),
    "flux-2-pro": intl.formatMessage({
      defaultMessage: "Reliable photoreal images",
      id: "gqAXExJP8/",
      description: "Card summary for the FLUX.2 Pro image model on the pricing page",
    }),
    "grok-imagine-image-2.0": intl.formatMessage({
      defaultMessage: "Bold, stylised images",
      id: "kfPXpCYidI",
      description: "Card summary for the Grok Imagine 2.0 image model on the pricing page",
    }),
    "flux-2-klein": intl.formatMessage({
      defaultMessage: "Quick drafts for exploring ideas",
      id: "Q7Cm8GRzCH",
      description: "Card summary for the FLUX.2 Klein image model on the pricing page",
    }),
    "krea-2-large": intl.formatMessage({
      defaultMessage: "Artistic, editorial looks",
      id: "9LIEz31Fmx",
      description: "Card summary for the Krea 2 Large image model on the pricing page",
    }),
    "veo-3.1": intl.formatMessage({
      defaultMessage: "Cinematic clips with sound",
      id: "no9lD9eDrr",
      description: "Card summary for the Veo 3.1 video model on the pricing page",
    }),
    "veo-3.1-fast": intl.formatMessage({
      defaultMessage: "Quicker, cheaper Veo clips",
      id: "ob6BOeVg1Z",
      description: "Card summary for the Veo 3.1 Fast video model on the pricing page",
    }),
    "kling-3-pro": intl.formatMessage({
      defaultMessage: "Smooth motion from a still",
      id: "ZqYKrJ31FK",
      description: "Card summary for the Kling 3.0 video model on the pricing page",
    }),
    "kling-o3-pro": intl.formatMessage({
      defaultMessage: "Edit and extend existing footage",
      id: "1WbVlM2sdF",
      description: "Card summary for the Kling 3.0 Omni video model on the pricing page",
    }),
    "seedance-2.5": intl.formatMessage({
      defaultMessage: "Short video from a brief",
      id: "FkVjP5MgdL",
      description: "Card summary for the Seedance 2.5 video model on the pricing page",
    }),
    "wan-3.0": intl.formatMessage({
      defaultMessage: "Clips that keep a reference look",
      id: "tDEahIWt6A",
      description: "Card summary for the Wan 3.0 video model on the pricing page",
    }),
    "minimax-h3": intl.formatMessage({
      defaultMessage: "High-resolution clips",
      id: "xH5zSd7FDU",
      description: "Card summary for the MiniMax H3 video model on the pricing page",
    }),
    "minimax-h3-max": intl.formatMessage({
      defaultMessage: "Expressive people and faces",
      id: "2VrNu3mZmp",
      description: "Card summary for the MiniMax H3 Max video model on the pricing page",
    }),
    "flux-3-video": intl.formatMessage({
      defaultMessage: "Photoreal motion",
      id: "fH8zr33NAK",
      description: "Card summary for the FLUX.3 Video model on the pricing page",
    }),
    "grok-imagine-video-1.5": intl.formatMessage({
      defaultMessage: "Fast, low-cost clips",
      id: "W3Kw7PrCu5",
      description: "Card summary for the Grok Imagine Video 1.5 model on the pricing page",
    }),
    "elevenlabs-v4": intl.formatMessage({
      defaultMessage: "Natural, expressive voice-over",
      id: "gQVNehK3w1",
      description: "Card summary for the ElevenLabs v4 voice model on the pricing page",
    }),
    "elevenlabs-v3": intl.formatMessage({
      defaultMessage: "Steady voice-over in many languages",
      id: "Pmd/DH6eoc",
      description: "Card summary for the ElevenLabs v3 voice model on the pricing page",
    }),
    "gemini-3.8-flash-tts": intl.formatMessage({
      defaultMessage: "Quick, low-cost voice-over",
      id: "SH/3azga8A",
      description: "Card summary for the Gemini 3.8 Flash TTS voice model on the pricing page",
    }),
    "fish-audio-s2.1-pro": intl.formatMessage({
      defaultMessage: "Natural voice-over in many languages",
      id: "zuqYJudcfe",
      description: "Card summary for the Fish Audio S2.1 Pro voice model on the pricing page",
    }),
    "fish-audio-drama-3": intl.formatMessage({
      defaultMessage: "Directed, dramatic performance",
      id: "TsKiHIUu3j",
      description: "Card summary for the Fish Audio Drama 3 voice model on the pricing page",
    }),
    "elevenlabs-music": intl.formatMessage({
      defaultMessage: "Music from a short description",
      id: "7cH/khk2xj",
      description: "Card summary for the ElevenLabs Music model on the pricing page",
    }),
    "elevenlabs-sfx": intl.formatMessage({
      defaultMessage: "Sound effects on demand",
      id: "toQvY0saVD",
      description: "Card summary for the ElevenLabs SFX model on the pricing page",
    }),
    "lyria-3-pro": intl.formatMessage({
      defaultMessage: "Full songs from a detailed brief",
      id: "/rO/1cl+oc",
      description: "Card summary for the Lyria 3 Pro music model on the pricing page",
    }),
    "bria-rmbg-2.0": intl.formatMessage({
      defaultMessage: "Remove an image background",
      id: "Gke6lGkaom",
      description: "Card summary for the Bria RMBG 2.0 background removal tool on the pricing page",
    }),
    "seedvr-2": intl.formatMessage({
      defaultMessage: "Upscale a small image",
      id: "ehdRjJUoSM",
      description: "Card summary for the SeedVR 2 image upscaler on the pricing page",
    }),
    "bytedance-upscaler": intl.formatMessage({
      defaultMessage: "Upscale a video",
      id: "vF01WtRXQ8",
      description: "Card summary for the ByteDance video upscaler on the pricing page",
    }),
    "universal-3.5-pro": intl.formatMessage({
      defaultMessage: "Captions and transcripts",
      id: "5V7e1iLBtQ",
      description: "Card summary for the Universal 3.5 Pro transcription model on the pricing page",
    }),
    "fish-audio-transcribe-1": intl.formatMessage({
      defaultMessage: "Captions from speech",
      id: "MLfqzCqul0",
      description: "Card summary for the Fish Audio Transcribe 1 model on the pricing page",
    }),
    "qwen3.8-omni-flash": intl.formatMessage({
      defaultMessage: "Describe and search footage",
      id: "07nyefIF8a",
      description: "Card summary for the Qwen 3.8 Omni Flash media model on the pricing page",
    }),
    "elevenlabs-dubbing": intl.formatMessage({
      defaultMessage: "Dub video in the speakers' own voices",
      id: "rQQ1b1ARBO",
      description: "Card summary for the ElevenLabs Dubbing model on the pricing page",
    }),
    "sync-lipsync-2": intl.formatMessage({
      defaultMessage: "Match lips to the new language",
      id: "ABp/G73p+A",
      description: "Card summary for the Sync Lipsync 2 model on the pricing page",
    }),
    "image-localise": intl.formatMessage({
      defaultMessage: "Translate the text inside an image",
      id: "FxLEHPtV49",
      description: "Card summary for the Iris Image Localise tool on the pricing page",
    }),
    "image-edit": intl.formatMessage({
      defaultMessage: "Change part of an image with words",
      id: "LpSbNeWQyy",
      description: "Card summary for the Iris Image Edit tool on the pricing page",
    }),
    "image-text": intl.formatMessage({
      defaultMessage: "Read the copy in an image",
      id: "ioDvkfLpcy",
      description: "Card summary for the Iris Image Text tool on the pricing page",
    }),
  };
}
