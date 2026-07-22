/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
/**
 * CSP frame-ancestors for Crowdin App iframe pages (`/crowdin-app/*`).
 *
 * Defaults cover Crowdin SaaS + Enterprise `*.crowdin.com` / `*.crowdin.cloud`.
 * Custom Enterprise UI domains (CNAME) are not under those hosts — add them via
 * `CROWDIN_APP_FRAME_ANCESTORS` (comma-separated origins). Values are merged
 * with defaults so SaaS embeds keep working.
 *
 * Apply this CSP only from the Next proxy (not also from next.config headers):
 * multiple CSP headers intersect, which would keep custom domains blocked.
 */

export const DEFAULT_CROWDIN_APP_FRAME_ANCESTORS = [
  "https://crowdin.com",
  "https://*.crowdin.com",
  "https://crowdin.cloud",
  "https://*.crowdin.cloud",
] as const;

export function parseCrowdinAppFrameAncestorsEnv(value: string | undefined | null): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Origin suitable for frame-ancestors from a Crowdin install `baseUrl`. */
export function frameAncestorFromCrowdinBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the allowlist: defaults ∪ env extras ∪ optional install origins.
 * Env extras are additive so operators can list custom Enterprise UI hosts
 * without dropping Crowdin SaaS defaults.
 */
export function resolveCrowdinAppFrameAncestors(options?: {
  envValue?: string | null;
  installBaseUrls?: readonly string[];
}): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const push = (value: string) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    result.push(value);
  };

  for (const ancestor of DEFAULT_CROWDIN_APP_FRAME_ANCESTORS) {
    push(ancestor);
  }
  for (const ancestor of parseCrowdinAppFrameAncestorsEnv(options?.envValue)) {
    push(ancestor);
  }
  for (const baseUrl of options?.installBaseUrls ?? []) {
    const origin = frameAncestorFromCrowdinBaseUrl(baseUrl);
    if (origin) {
      push(origin);
    }
  }

  return result;
}

export function getCrowdinAppFrameAncestors(): string[] {
  return resolveCrowdinAppFrameAncestors({
    envValue: process.env.CROWDIN_APP_FRAME_ANCESTORS,
  });
}

export function buildCrowdinAppFrameAncestorsCsp(ancestors = getCrowdinAppFrameAncestors()) {
  return `frame-ancestors ${ancestors.join(" ")};`;
}
