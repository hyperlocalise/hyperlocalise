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
import { describe, expect, it } from "vite-plus/test";

import {
  managedAiReservationAmountUsd,
  normalizeUsdAmount,
  type ManagedAiPricingConfig,
} from "@/lib/billing/managed-ai-pricing";

const config: ManagedAiPricingConfig = {
  mode: "enforced",
  pricingVersion: "test",
  chatReservationUsd: 0.5,
  imagePriceUsd: 0.25,
  videoPriceUsdPerSecond: 0.4,
  imageModelId: "custom/image",
  videoModelId: "custom/video",
};

describe("managed AI pricing", () => {
  it("calculates configured chat, image, and video reservations", () => {
    expect(managedAiReservationAmountUsd(config, { surface: "chat" })).toBe(0.5);
    expect(managedAiReservationAmountUsd(config, { surface: "image", imageCount: 2 })).toBe(0.5);
    expect(managedAiReservationAmountUsd(config, { surface: "video", durationSeconds: 8 })).toBe(
      3.2,
    );
  });

  it("stores USD amounts with fixed precision", () => {
    expect(normalizeUsdAmount(0.0123456784)).toBe("0.012345678");
  });
});
