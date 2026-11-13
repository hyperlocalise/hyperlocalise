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

import posthog from "posthog-js";

/** Capture a product event in the browser. No-ops until PostHog has initialized. */
export function capturePostHogClientEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
) {
  if (typeof window === "undefined" || !posthog.__loaded) {
    return;
  }

  posthog.capture(name, properties);
}
