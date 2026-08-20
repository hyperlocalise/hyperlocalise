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
import { getManagedVideoModel, hyperlocaliseVideoModelId } from "@/lib/providers/language-model";

export { hyperlocaliseVideoModelId };

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
  durationSeconds?: number,
): Promise<{ video: Buffer; mimeType: string }> {
  const model = getVideoModel();
  const result = await generateVideo({
    model,
    prompt,
    inputReferences: [{ data: videoBuffer, mediaType: "video/mp4" }],
    aspectRatio: "adaptive",
    generateAudio: true,
    ...(durationSeconds != null ? { duration: durationSeconds } : {}),
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

  const run = async () => {
    try {
      const generated = await generateVideoFromPrompt(videoBuffer, prompt, durationSeconds);
      return { ...generated, prompt };
    } catch (error) {
      throw wrapVideoGenerationError(error);
    }
  };

  if (!billing) {
    return run();
  }

  return withAgentRuntimeUsageMetering({
    organizationId: billing.organizationId,
    operationKey: billing.operationKey,
    source: billing.source ?? "video_localization",
    interactionId: billing.interactionId,
    dimensions: {
      surface: "video",
      agent_surface: "video_localization",
      ...billing.dimensions,
    },
    run,
  });
}
