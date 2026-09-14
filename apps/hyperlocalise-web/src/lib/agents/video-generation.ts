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
import { experimental_generateVideo as generateVideo } from "ai";

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
import { getManagedVideoModel, hyperlocaliseVideoModelId } from "@/lib/providers/language-model";

export { hyperlocaliseVideoModelId };

const DEFAULT_VIDEO_DURATION_SECONDS = 5;

export type VideoGenerationResult = {
  video: Buffer;
  mimeType: string;
  prompt: string;
};

export type VideoGenerationBilling = {
  organizationId: string;
  operationKey: string;
  source?: string;
  interactionId?: string | null;
  dimensions?: Record<string, string | number | boolean | null>;
};

export type VideoLocalizationErrorCode =
  | "video_model_unavailable"
  | "video_edit_region_blocked"
  | "video_localization_failed";

export class VideoLocalizationError extends Error {
  readonly code: VideoLocalizationErrorCode;

  constructor(code: VideoLocalizationErrorCode, message: string) {
    super(message);
    this.name = "VideoLocalizationError";
    this.code = code;
  }
}

function getVideoModel() {
  return getManagedVideoModel();
}

function videoJobId(providerMetadata: unknown) {
  if (!providerMetadata || typeof providerMetadata !== "object") return undefined;
  const gateway = Reflect.get(providerMetadata, "gateway");
  if (!gateway || typeof gateway !== "object") return undefined;
  const asyncJob = Reflect.get(gateway, "asyncJob");
  if (!asyncJob || typeof asyncJob !== "object") return undefined;
  const jobId = Reflect.get(asyncJob, "jobId");
  return typeof jobId === "string" ? jobId : undefined;
}

function isRegionBlockedMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not currently available") &&
    (normalized.includes("european") ||
      normalized.includes("eea") ||
      normalized.includes("switzerland") ||
      normalized.includes("united kingdom") ||
      normalized.includes("uk"))
  );
}

function wrapVideoGenerationError(error: unknown): VideoLocalizationError {
  if (error instanceof VideoLocalizationError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "video localization failed";
  if (isRegionBlockedMessage(message)) {
    return new VideoLocalizationError("video_edit_region_blocked", message);
  }
  return new VideoLocalizationError("video_localization_failed", message);
}

async function generateVideoFromPrompt(
  videoBuffer: Buffer,
  prompt: string,
  durationSeconds: number,
): Promise<{
  video: Buffer;
  mimeType: string;
  durationSeconds: number;
  providerGenerationId?: string;
}> {
  const model = getVideoModel();
  const result = await generateVideo({
    model,
    prompt,
    inputReferences: [{ data: videoBuffer, mediaType: "video/mp4" }],
    aspectRatio: "adaptive",
    generateAudio: true,
    duration: durationSeconds,
    providerOptions: {
      bytedance: {
        pollTimeoutMs: 600_000,
      },
    },
  });

  const generatedVideo = result.video;
  if (!generatedVideo) {
    throw new VideoLocalizationError("video_localization_failed", "No video was generated");
  }

  return {
    video: Buffer.from(generatedVideo.uint8Array),
    mimeType: generatedVideo.mediaType || "video/mp4",
    durationSeconds,
    providerGenerationId: videoJobId(result.providerMetadata),
  };
}

/**
 * End-to-end video regeneration pipeline:
 * 1. Send the source video and localization prompt to Seedance 2.5 via AI Gateway
 * 2. Return the generated video buffer and the prompt used
 */
export async function regenerateVideoFromAttachment(
  videoBuffer: Buffer,
  _mimeType: string,
  userText: string,
  billing?: VideoGenerationBilling,
  durationSeconds?: number,
): Promise<VideoGenerationResult> {
  const prompt = userText.trim();
  if (!prompt) {
    throw new VideoLocalizationError(
      "video_localization_failed",
      "Video generation prompt is required",
    );
  }

  const normalizedDurationSeconds = durationSeconds ?? DEFAULT_VIDEO_DURATION_SECONDS;
  const run = async () => {
    try {
      const generated = await generateVideoFromPrompt(
        videoBuffer,
        prompt,
        normalizedDurationSeconds,
      );
      return {
        video: generated.video,
        mimeType: generated.mimeType,
        prompt,
        billing: {
          durationSeconds: generated.durationSeconds,
          providerGenerationId: generated.providerGenerationId,
        },
      };
    } catch (error) {
      throw wrapVideoGenerationError(error);
    }
  };

  if (!billing) {
    const result = await run();
    return { video: result.video, mimeType: result.mimeType, prompt: result.prompt };
  }

  const source = billing.source ?? "video_localization";
  const dimensions = {
    surface: "video",
    agent_surface: "video_localization",
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
    return { video: result.video, mimeType: result.mimeType, prompt: result.prompt };
  }

  const estimatedAmountUsd = managedAiReservationAmountUsd(pricingConfig, {
    surface: "video",
    durationSeconds: normalizedDurationSeconds,
  });
  if (estimatedAmountUsd == null) {
    throw new ManagedAiCreditAccessError({
      code: "ai_credit_pricing_not_configured",
      surface: "video",
    });
  }
  const reservationResult = await reserveManagedAiCredit({
    organizationId: billing.organizationId,
    operationKey: `${billing.operationKey}:ai_tokens`,
    source,
    modelId: pricingConfig.videoModelId,
    credentialSource: "gateway",
    estimatedAmountUsd,
    interactionId: billing.interactionId ?? undefined,
    mode: pricingConfig.mode,
    dimensions: {
      ...dimensions,
      provider_model_id: hyperlocaliseVideoModelId,
      synthetic_unit: "video_second",
      requested_duration_seconds: normalizedDurationSeconds,
    },
  });
  if (!reservationResult.ok) {
    throw new ManagedAiCreditAccessError(reservationResult.error);
  }

  try {
    const result = await execute();
    await settleManagedAiCredit({
      reservation: reservationResult.value,
      modelId: pricingConfig.videoModelId,
      tokenUsage: {
        inputTokens: 0,
        outputTokens: result.billing.durationSeconds,
        totalTokens: result.billing.durationSeconds,
      },
      providerGenerationId: result.billing.providerGenerationId,
      shadowAmountUsd: pricingConfig.videoPriceUsdPerSecond
        ? pricingConfig.videoPriceUsdPerSecond * result.billing.durationSeconds
        : undefined,
    });
    return { video: result.video, mimeType: result.mimeType, prompt: result.prompt };
  } catch (error) {
    await releaseManagedAiCredit({
      reservation: reservationResult.value,
      reason: "video_generation_failed",
    });
    throw error;
  }
}
