import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

import {
  isBlockedHost,
  normalizeHostname,
  type SsrfGuardError,
  validatePublicHttpUrl,
} from "./ssrf-guard";

export type PinnedHttpConnectTarget = {
  requestUrl: string;
  hostHeader?: string;
  connect: {
    host: string;
    port: number;
    servername?: string;
  };
};

export async function resolvePinnedHttpConnectTarget(
  url: string,
): Promise<Result<PinnedHttpConnectTarget, SsrfGuardError>> {
  const urlResult = validatePublicHttpUrl(url);
  if (isErr(urlResult)) {
    return urlResult;
  }

  const parsed = urlResult.value;
  const hostname = normalizeHostname(parsed.hostname);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  const servername = parsed.protocol === "https:" ? hostname : undefined;

  if (looksLikeIpAddress(hostname)) {
    if (isBlockedHost(hostname)) {
      return err({ code: "host_not_allowed" });
    }

    return ok({
      requestUrl: parsed.toString(),
      connect: { host: hostname, port, servername },
    });
  }

  const dns = await import("node:dns/promises");
  const lookupResult = await fromThrowableAsync(
    dns.lookup(hostname, { all: true, verbatim: true }),
  );
  if (isErr(lookupResult)) {
    return err({ code: "host_unresolvable" });
  }

  const results = lookupResult.value;
  if (!results.length) {
    return err({ code: "host_unresolvable" });
  }

  for (const result of results) {
    if (isBlockedHost(result.address)) {
      return err({ code: "host_resolves_to_restricted_address" });
    }
  }

  const preferred =
    results.find((result) => result.family === 4) ??
    results.find((result) => result.family === 6) ??
    results[0];

  return ok({
    requestUrl: toPinnedIpUrl(parsed, preferred.address),
    hostHeader: parsed.host,
    connect: {
      host: preferred.address,
      port,
      servername,
    },
  });
}

export async function resolveResolvablePublicHost(
  hostname: string,
): Promise<Result<void, SsrfGuardError>> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isBlockedHost(normalized)) {
    return err({ code: "host_not_allowed" });
  }

  if (looksLikeIpAddress(normalized)) {
    return ok(undefined);
  }

  const dns = await import("node:dns/promises");
  const lookupResult = await fromThrowableAsync(
    dns.lookup(normalized, { all: true, verbatim: true }),
  );
  if (isErr(lookupResult)) {
    return err({ code: "host_unresolvable" });
  }

  const results = lookupResult.value;
  if (!results.length) {
    return err({ code: "host_unresolvable" });
  }

  for (const result of results) {
    if (isBlockedHost(result.address)) {
      return err({ code: "host_resolves_to_restricted_address" });
    }
  }

  return ok(undefined);
}

export async function resolvePublicHttpUrl(
  url: string,
): Promise<Result<PinnedHttpConnectTarget, SsrfGuardError>> {
  return resolvePinnedHttpConnectTarget(url);
}

function looksLikeIpAddress(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function toPinnedIpUrl(parsed: URL, address: string): string {
  const pinned = new URL(parsed.toString());
  pinned.hostname = address;
  return pinned.toString();
}
