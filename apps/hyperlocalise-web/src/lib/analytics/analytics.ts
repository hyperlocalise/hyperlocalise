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
import type { AnalyticsProperties } from "./events";
import { sanitizeAnalyticsProperties } from "./events";

export type AnalyticsTrackFn = (
  name: string,
  properties?: Record<string, string | number | boolean>,
) => void | Promise<void>;

/**
 * Provider-neutral analytics facade. Adapters wrap @vercel/analytics client/server.
 */
export class Analytics {
  constructor(private readonly trackFn: AnalyticsTrackFn) {}

  track(name: string, properties?: AnalyticsProperties): void {
    const sanitized = sanitizeAnalyticsProperties(properties);
    void this.trackFn(name, sanitized);
  }
}
