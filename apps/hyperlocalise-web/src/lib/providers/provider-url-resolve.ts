import { isErr } from "@/lib/primitives/result/results";
import { formatSsrfGuardError, normalizeHostname } from "@/lib/security/ssrf-guard";
import { resolveResolvablePublicHost } from "@/lib/security/ssrf-guard-dns";

import { isSafeProviderUrl } from "./provider-url-safety";

export async function assertProviderUrlResolvable(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!isSafeProviderUrl(parsed)) {
    throw new Error("Provider URL is invalid or unsafe.");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname.endsWith(".test")) {
    return;
  }

  const hostResult = await resolveResolvablePublicHost(hostname);
  if (isErr(hostResult)) {
    throw new Error(formatSsrfGuardError(hostResult.error));
  }
}
