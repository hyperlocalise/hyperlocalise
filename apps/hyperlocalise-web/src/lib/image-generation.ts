import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";

import { env } from "@/lib/env";

export type ImageGenerationResult = {
  image: Buffer;
  mimeType: string;
  prompt: string;
};

function getImageModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return provider.image("gpt-image-2-2026-04-21");
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
): Promise<ImageGenerationResult> {
  // The AI SDK image prompt accepts the source image as a Buffer and infers media type from bytes.
  const prompt = userText.trim();
  if (!prompt) {
    throw new Error("Image generation prompt is required");
  }

  const generated = await generateImageFromPrompt(imageBuffer, prompt);
  return { ...generated, prompt };
}
