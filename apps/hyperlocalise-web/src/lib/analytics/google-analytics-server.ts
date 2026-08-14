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
import { randomUUID } from "node:crypto";

import { GA_MEASUREMENT_ID } from "./google-analytics";

const GA_MEASUREMENT_PROTOCOL_URL = "https://www.google-analytics.com/mp/collect";

export type GoogleAnalyticsServerTrackOptions = {
  measurementId?: string;
  apiSecret?: string;
  fetchFn?: typeof fetch;
  clientId?: string;
};

function measurementProtocolApiSecret(options?: GoogleAnalyticsServerTrackOptions) {
  return options?.apiSecret ?? process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET;
}

/** Fire-and-forget GA4 Measurement Protocol event. No-ops without an API secret. */
export async function trackGoogleAnalyticsServerEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
  options?: GoogleAnalyticsServerTrackOptions,
): Promise<void> {
  const apiSecret = measurementProtocolApiSecret(options);
  if (!apiSecret) return;

  const measurementId = options?.measurementId ?? GA_MEASUREMENT_ID;
  const fetchFn = options?.fetchFn ?? fetch;
  const url = new URL(GA_MEASUREMENT_PROTOCOL_URL);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  try {
    await fetchFn(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: options?.clientId ?? randomUUID(),
        events: [
          {
            name,
            params: properties ?? {},
          },
        ],
      }),
    });
  } catch {
    // Analytics must not break the product path.
  }
}
