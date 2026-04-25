import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";

import { env } from "@/lib/env";

export type ImageGenerationResult = {
  image: Buffer;
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
async function generateImageFromPrompt(imageBuffer: Buffer, prompt: string): Promise<Buffer> {
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

  return Buffer.from(generatedImage.uint8Array);
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
  const prompt = userText.trim();
  if (!prompt) {
    throw new Error("Image generation prompt is required");
  }

  const image = await generateImageFromPrompt(imageBuffer, prompt);
  return { image, prompt };
}
