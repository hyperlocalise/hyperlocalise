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
import { describe, expect, it, vi } from "vite-plus/test";

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

vi.mock("./client", () => ({
  clientAnalytics: {
    track: trackMock,
  },
}));

import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "./events";
import { trackMarketingCtaClick } from "./marketing-cta";

describe("trackMarketingCtaClick", () => {
  it("emits the marketing CTA event with cta and source", () => {
    trackMarketingCtaClick("sign_in", "navbar");

    expect(trackMock).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.marketingCtaClick, {
      cta: "sign_in",
      source: "navbar",
    });
  });
});
