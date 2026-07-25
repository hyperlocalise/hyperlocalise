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

import { Analytics } from "./analytics";
import {
  LOCALISATION_AUDIT_ANALYTICS_EVENTS,
  sanitizeAnalyticsProperties,
  scoreBand,
} from "./events";

describe("analytics sanitization", () => {
  it("keeps at most two allowed non-PII properties", () => {
    expect(
      sanitizeAnalyticsProperties({
        email: "a@b.com",
        domain: "example.com",
        url: "https://example.com",
        outcome: "created",
        status: "queued",
        stage: "crawling",
        findings: "secret",
      }),
    ).toEqual({
      outcome: "created",
      status: "queued",
    });
  });

  it("maps score bands without inventing benchmarks", () => {
    expect(scoreBand(92)).toBe("high");
    expect(scoreBand(55)).toBe("mid");
    expect(scoreBand(12)).toBe("low");
    expect(scoreBand(null)).toBe("unknown");
  });

  it("tracks funnel event names through Analytics", () => {
    const calls: Array<[string, Record<string, string | number | boolean>]> = [];
    const analytics = new Analytics((name, properties) => {
      calls.push([name, properties ?? {}]);
    });

    analytics.track(LOCALISATION_AUDIT_ANALYTICS_EVENTS.start, {
      outcome: "created",
      email: "leak@example.com",
    });

    expect(calls).toEqual([[LOCALISATION_AUDIT_ANALYTICS_EVENTS.start, { outcome: "created" }]]);
  });
});
