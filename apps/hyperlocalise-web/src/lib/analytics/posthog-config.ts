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

/** Same-origin ingest prefix rewritten to the PostHog cloud host. */
export const POSTHOG_INGEST_PATH = "/ingest";

/** US Cloud ingest host. Override with NEXT_PUBLIC_POSTHOG_HOST for EU or self-hosted. */
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export function posthogProjectToken(): string | undefined {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  return token ? token : undefined;
}

export function isPostHogConfigured(): boolean {
  return Boolean(posthogProjectToken());
}

export function posthogIngestHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim().replace(/\/$/, "");
  return host || DEFAULT_POSTHOG_HOST;
}

export function posthogUiHost(ingestHost = posthogIngestHost()): string {
  return ingestHost.includes("eu.") ? "https://eu.posthog.com" : "https://us.posthog.com";
}

export function posthogNextRewrites(): Array<{ source: string; destination: string }> {
  if (!isPostHogConfigured()) {
    return [];
  }

  const host = posthogIngestHost();
  return [
    {
      source: `${POSTHOG_INGEST_PATH}/static/:path*`,
      destination: `${host}/static/:path*`,
    },
    {
      source: `${POSTHOG_INGEST_PATH}/:path*`,
      destination: `${host}/:path*`,
    },
  ];
}
