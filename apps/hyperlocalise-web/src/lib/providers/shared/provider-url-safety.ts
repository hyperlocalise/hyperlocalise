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
import {
  isBlockedHost,
  isBlockedIpv4Address,
  isBlockedIpv6Address,
  normalizeHostname,
} from "@/lib/security/ssrf-guard";

export function normalizeProviderBaseUrl(
  baseUrl: string | null | undefined,
  defaultBaseUrl: string,
) {
  try {
    const url = new URL(baseUrl ?? defaultBaseUrl);
    if (!isSafeProviderUrl(url)) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Syntactic URL checks only. Does not validate DNS resolution. */
export function normalizeProviderDownloadUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!isSafeProviderUrl(parsed)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function requireProviderBaseUrl(
  baseUrl: string | null | undefined,
  defaultBaseUrl: string,
  providerName: string,
) {
  const normalized = normalizeProviderBaseUrl(baseUrl, defaultBaseUrl);
  if (!normalized) {
    throw new Error(`${providerName} provider base URL is invalid or unsafe.`);
  }
  return normalized;
}

export function isSafeProviderUrl(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (!hostname.includes(".") && !hostname.includes(":")) return false;

  if (isBlockedIpv4Address(hostname) || isBlockedIpv6Address(hostname) || isBlockedHost(hostname)) {
    return false;
  }

  return true;
}
