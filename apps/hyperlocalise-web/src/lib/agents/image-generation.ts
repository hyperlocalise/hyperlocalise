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
import { generateImage } from "ai";

import { withAgentRuntimeUsageMetering } from "@/lib/billing/agent-runtime-usage";
import {
  getManagedImageModel,
  isManagedLanguageModelAvailable,
} from "@/lib/providers/language-model";

export type ImageGenerationResult = {
  image: Buffer;
  mimeType: string;
  prompt: string;
};

export type ImageGenerationBilling = {
  organizationId: string;
  operationKey: string;
  source?: string;
  interactionId?: string | null;
  dimensions?: Record<string, string | number | boolean | null>;
};

function getImageModel() {
  if (!isManagedLanguageModelAvailable()) {
    throw new Error("AI_GATEWAY_API_KEY is not configured");
  }
  return getManagedImageModel();
}

/**
 * Generates a new image from the uploaded source image and user intent.
 */
async function generateImageFromPrompt(
  imageBuffer: Buffer,
  prompt: string,
): Promise<{ image: Buffer; mimeType: string }> {
  const model = getImageModel();

  const result = await generateImage({
    model,
    prompt: {
      images: [imageBuffer],
      text: prompt,
    },
    n: 1,
  });

  const generatedImage = result.images[0];
  if (!generatedImage) {
    throw new Error("No image was generated");
  }

  return {
    image: Buffer.from(generatedImage.uint8Array),
    mimeType: generatedImage.mediaType,
  };
}

/**
 * End-to-end image regeneration pipeline:
 * 1. Send the source image and interpreted user intent to the image model
 * 2. Return the generated image buffer and the prompt used
 */
export async function regenerateImageFromAttachment(
  imageBuffer: Buffer,
  _mimeType: string,
  userText: string,
  billing?: ImageGenerationBilling,
): Promise<ImageGenerationResult> {
  // The AI SDK image prompt accepts the source image as a Buffer and infers media type from bytes.
  const prompt = userText.trim();
  if (!prompt) {
    throw new Error("Image generation prompt is required");
  }

  const run = async () => {
    const generated = await generateImageFromPrompt(imageBuffer, prompt);
    return { ...generated, prompt };
  };

  if (!billing) {
    return run();
  }

  return withAgentRuntimeUsageMetering({
    organizationId: billing.organizationId,
    operationKey: billing.operationKey,
    source: billing.source ?? "image_localization",
    interactionId: billing.interactionId,
    dimensions: {
      surface: "image",
      agent_surface: "image_localization",
      ...billing.dimensions,
    },
    run,
  });
}
