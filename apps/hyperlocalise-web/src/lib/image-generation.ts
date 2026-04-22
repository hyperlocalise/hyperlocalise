import { createOpenAI } from "@ai-sdk/openai";
import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import { env } from "@/lib/env";

const imageAnalysisOutputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1)
    .describe(
      "A detailed, high-quality prompt for image generation based on the user's image and intent",
    ),
});

export type ImageGenerationResult = {
  image: Buffer;
  prompt: string;
};

function getVisionModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return provider("gpt-5.4-mini");
}

function getImageModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return provider.image("gpt-image-2-2026-04-21");
}

/**
 * Analyzes an uploaded image using a vision model to detect intent and rewrite
 * an optimized prompt for image generation.
 */
async function analyzeImageAndRewritePrompt(
  imageBuffer: Buffer,
  mimeType: string,
  userText?: string,
): Promise<string> {
  const model = getVisionModel();

  const { output } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Analyze the attached image and the user's request. Rewrite a detailed, high-quality prompt for an AI image generation model.",
              "The prompt should capture the intent, style, composition, and key elements from the original image while incorporating any modifications the user requests.",
              userText ? `User request: ${userText}` : "",
              "Respond ONLY with the rewritten image generation prompt.",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
          {
            type: "image",
            image: imageBuffer,
            mediaType: mimeType,
          },
        ],
      },
    ],
    output: Output.object({ schema: imageAnalysisOutputSchema }),
  });

  return output.prompt;
}

/**
 * Generates a new image from a text prompt using an image generation model.
 */
async function generateImageFromPrompt(prompt: string): Promise<Buffer> {
  const model = getImageModel();

  const result = await generateImage({
    model,
    prompt,
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
 * 1. Analyze the source image and rewrite an optimized generation prompt
 * 2. Generate a new image using the rewritten prompt
 * 3. Return the generated image buffer and the prompt used
 */
export async function regenerateImageFromAttachment(
  imageBuffer: Buffer,
  mimeType: string,
  userText?: string,
): Promise<ImageGenerationResult> {
  const prompt = await analyzeImageAndRewritePrompt(imageBuffer, mimeType, userText);
  const image = await generateImageFromPrompt(prompt);
  return { image, prompt };
}
