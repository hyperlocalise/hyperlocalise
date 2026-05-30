import dns from "node:dns/promises";

import { isBlockedHost, normalizeHostname } from "./ssrf-guard";

export async function assertResolvablePublicHost(hostname: string): Promise<void> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isBlockedHost(normalized)) {
    throw new Error("URL host is not allowed.");
  }

  if (looksLikeIpAddress(normalized)) {
    return;
  }

  const results = await dns.lookup(normalized, { all: true, verbatim: true });
  if (!results.length) {
    throw new Error("URL host could not be resolved.");
  }

  for (const result of results) {
    if (isBlockedHost(result.address)) {
      throw new Error("URL host resolves to a private or restricted address.");
    }
  }
}

export async function assertPublicHttpUrlResolvable(url: string): Promise<void> {
  const { isPublicHttpUrl } = await import("./ssrf-guard");
  if (!isPublicHttpUrl(url)) {
    throw new Error("URL is not an allowed public HTTP(S) endpoint.");
  }

  await assertResolvablePublicHost(new URL(url).hostname);
}

function looksLikeIpAddress(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}
