import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { isBlockedHost, normalizeHostname, type SsrfGuardError } from "./ssrf-guard";

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

function looksLikeIpAddress(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}
