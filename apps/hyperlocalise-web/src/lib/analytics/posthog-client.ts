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

export type PostHogClientExceptionProperties = Record<string, string | number | boolean>;

function isPostHogClientReady() {
  return typeof window !== "undefined" && Boolean(posthog.__loaded);
}

/** Capture a product event in the browser. No-ops until PostHog has initialized. */
export function capturePostHogClientEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
) {
  if (!isPostHogClientReady()) {
    return;
  }

  posthog.capture(name, properties);
}

/**
 * Report an exception to PostHog Error Tracking. No-ops until PostHog has
 * initialized. Swallows SDK failures so recovery UI can still render.
 */
export function capturePostHogClientException(
  error: unknown,
  properties?: PostHogClientExceptionProperties,
) {
  if (!isPostHogClientReady()) {
    return;
  }

  try {
    posthog.captureException(error, properties);
  } catch {
    // Error tracking must not break the product path.
  }
}
