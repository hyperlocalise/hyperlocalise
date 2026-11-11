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
import { isErr } from "@/lib/primitives/result/results";
import { assertResolvablePublicHttpUrl } from "@/lib/security/public-http-fetch";
import { isBlockedHost, isPublicHttpUrl } from "@/lib/security/ssrf-guard";

export function isBlockedBrowserNavigationUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }
    return isBlockedHost(parsed.hostname);
  } catch {
    return true;
  }
}

/** Public http(s) URL whose host resolves only to public addresses. */
export async function isAllowedBrowserUrl(url: string): Promise<boolean> {
  if (!isPublicHttpUrl(url) || isBlockedBrowserNavigationUrl(url)) {
    return false;
  }
  return !isErr(await assertResolvablePublicHttpUrl(url));
}

export async function filterAllowedBrowserUrls(urls: string[]): Promise<string[]> {
  const allowed: string[] = [];
  for (const url of urls) {
    if (await isAllowedBrowserUrl(url)) {
      allowed.push(url);
    }
  }
  return allowed;
}
