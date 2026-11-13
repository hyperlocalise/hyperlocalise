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

export type ManagedAiPricingConfig = {
  pricingVersion: string;
  imageModelId: string;
  videoModelId: string;
};

export function getManagedAiPricingConfig(): ManagedAiPricingConfig {
  return {
    pricingVersion: env.AI_CREDIT_PRICING_VERSION,
    imageModelId: env.AI_CREDIT_IMAGE_MODEL_ID,
    videoModelId: env.AI_CREDIT_VIDEO_MODEL_ID,
  };
}

export function normalizeUsdAmount(value: number): string {
  return value.toFixed(9);
}
