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
"use client";

import { clientAnalytics } from "./client";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "./events";

export function trackMarketingCtaClick(cta: string, source: string) {
  clientAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.marketingCtaClick, { cta, source });
}
