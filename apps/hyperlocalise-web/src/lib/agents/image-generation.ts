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
  ManagedAiCreditAccessError,
  releaseManagedAiCredit,
  reserveManagedAiCredit,
  settleManagedAiCredit,
} from "@/lib/billing/managed-ai-credit";
import {
  getManagedAiPricingConfig,
  managedAiReservationAmountUsd,
} from "@/lib/billing/managed-ai-pricing";
import {
  getManagedImageModel,
  hyperlocaliseImageModelId,
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
  return getManagedImageModel();
}

function imageGenerationId(providerMetadata: unknown) {
  if (!providerMetadata || typeof providerMetadata !== "object") return undefined;
  const gateway = Reflect.get(providerMetadata, "gateway");
  if (!gateway || typeof gateway !== "object") return undefined;
  const generationId = Reflect.get(gateway, "generationId");
  return typeof generationId === "string" ? generationId : undefined;
}

/**
 * Generates a new image from the uploaded source image and user intent.
 */
async function generateImageFromPrompt(
  imageBuffer: Buffer,
  prompt: string,
): Promise<{
  image: Buffer;
  mimeType: string;
  imageCount: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  providerGenerationId?: string;
}> {
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
    imageCount: result.images.length,
    tokenUsage:
      (result.usage?.totalTokens ?? 0) > 0
        ? {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
          }
        : null,
    providerGenerationId: imageGenerationId(result.providerMetadata),
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
    return {
      image: generated.image,
      mimeType: generated.mimeType,
      prompt,
      billing: {
        imageCount: generated.imageCount,
        tokenUsage: generated.tokenUsage,
        providerGenerationId: generated.providerGenerationId,
      },
    };
  };

  if (!billing) {
    const result = await run();
    return { image: result.image, mimeType: result.mimeType, prompt: result.prompt };
  }

  const source = billing.source ?? "image_localization";
  const dimensions = {
    surface: "image",
    agent_surface: "image_localization",
    ...billing.dimensions,
  };
  const execute = () =>
    withAgentRuntimeUsageMetering({
      organizationId: billing.organizationId,
      operationKey: billing.operationKey,
      source,
      interactionId: billing.interactionId,
      dimensions,
      run,
    });
  const pricingConfig = getManagedAiPricingConfig();
  if (pricingConfig.mode === "legacy") {
    const result = await execute();
    return { image: result.image, mimeType: result.mimeType, prompt: result.prompt };
  }

  const estimatedAmountUsd = managedAiReservationAmountUsd(pricingConfig, {
    surface: "image",
    imageCount: 1,
  });
  if (estimatedAmountUsd == null) {
    throw new ManagedAiCreditAccessError({
      code: "ai_credit_pricing_not_configured",
      surface: "image",
    });
  }
  const reservationResult = await reserveManagedAiCredit({
    organizationId: billing.organizationId,
    operationKey: `${billing.operationKey}:ai_tokens`,
    source,
    modelId: hyperlocaliseImageModelId,
    credentialSource: "gateway",
    estimatedAmountUsd,
    interactionId: billing.interactionId ?? undefined,
    mode: pricingConfig.mode,
    dimensions: {
      ...dimensions,
      provider_model_id: hyperlocaliseImageModelId,
      fallback_synthetic_unit: "image",
    },
  });
  if (!reservationResult.ok) {
    throw new ManagedAiCreditAccessError(reservationResult.error);
  }

  try {
    const result = await execute();
    const tokenUsage = result.billing.tokenUsage ?? {
      inputTokens: 0,
      outputTokens: result.billing.imageCount,
      totalTokens: result.billing.imageCount,
    };
    await settleManagedAiCredit({
      reservation: reservationResult.value,
      modelId: result.billing.tokenUsage
        ? hyperlocaliseImageModelId
        : pricingConfig.imageModelId,
      tokenUsage,
      providerGenerationId: result.billing.providerGenerationId,
      shadowAmountUsd: pricingConfig.imagePriceUsd
        ? pricingConfig.imagePriceUsd * result.billing.imageCount
        : undefined,
    });
    return { image: result.image, mimeType: result.mimeType, prompt: result.prompt };
  } catch (error) {
    await releaseManagedAiCredit({
      reservation: reservationResult.value,
      reason: "image_generation_failed",
    });
    throw error;
  }
}
