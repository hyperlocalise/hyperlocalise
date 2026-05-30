import dns from "node:dns/promises";

import { isBlockedHost, isPublicHttpUrl, normalizeHostname } from "./ssrf-guard";

export type PinnedHttpConnectTarget = {
  requestUrl: string;
  connect: {
    host: string;
    port: number;
    servername?: string;
  };
};

export async function resolvePinnedHttpConnectTarget(
  url: string,
): Promise<PinnedHttpConnectTarget> {
  if (!isPublicHttpUrl(url)) {
    throw new Error("URL is not an allowed public HTTP(S) endpoint.");
  }

  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  const servername = parsed.protocol === "https:" ? hostname : undefined;

  if (looksLikeIpAddress(hostname)) {
    if (isBlockedHost(hostname)) {
      throw new Error("URL host is not allowed.");
    }

    return {
      requestUrl: parsed.toString(),
      connect: { host: hostname, port, servername },
    };
  }

  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!results.length) {
    throw new Error("URL host could not be resolved.");
  }

  for (const result of results) {
    if (isBlockedHost(result.address)) {
      throw new Error("URL host resolves to a private or restricted address.");
    }
  }

  const preferred =
    results.find((result) => result.family === 4) ??
    results.find((result) => result.family === 6) ??
    results[0];

  return {
    requestUrl: parsed.toString(),
    connect: {
      host: preferred.address,
      port,
      servername,
    },
  };
}

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
  await resolvePinnedHttpConnectTarget(url);
}

function looksLikeIpAddress(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}
