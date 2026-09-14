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
import "server-only";

import { env } from "@/lib/env";

export type AiCreditMeteringMode = "legacy" | "shadow" | "enforced";
export type ManagedAiBillableSurface = "chat" | "image" | "video";

export type ManagedAiPricingConfig = {
  mode: AiCreditMeteringMode;
  pricingVersion: string;
  chatReservationUsd?: number;
  imagePriceUsd?: number;
  videoPriceUsdPerSecond?: number;
  imageModelId: string;
  videoModelId: string;
};

export function getManagedAiPricingConfig(): ManagedAiPricingConfig {
  return {
    mode: env.AI_CREDIT_METERING_MODE,
    pricingVersion: env.AI_CREDIT_PRICING_VERSION,
    chatReservationUsd: env.AI_CREDIT_CHAT_RESERVATION_USD,
    imagePriceUsd: env.AI_CREDIT_IMAGE_PRICE_USD,
    videoPriceUsdPerSecond: env.AI_CREDIT_VIDEO_PRICE_USD_PER_SECOND,
    imageModelId: env.AI_CREDIT_IMAGE_MODEL_ID,
    videoModelId: env.AI_CREDIT_VIDEO_MODEL_ID,
  };
}

export function managedAiReservationAmountUsd(
  config: ManagedAiPricingConfig,
  input:
    | { surface: "chat" }
    | { surface: "image"; imageCount?: number }
    | { surface: "video"; durationSeconds: number },
): number | null {
  switch (input.surface) {
    case "chat":
      return config.chatReservationUsd ?? null;
    case "image":
      return config.imagePriceUsd == null ? null : config.imagePriceUsd * (input.imageCount ?? 1);
    case "video":
      return config.videoPriceUsdPerSecond == null
        ? null
        : config.videoPriceUsdPerSecond * input.durationSeconds;
  }
}

export function normalizeUsdAmount(value: number): string {
  return value.toFixed(9);
}
