import {
  assertResolvablePublicHost,
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

export async function assertProviderUrlResolvable(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!isSafeProviderUrl(parsed)) {
    throw new Error("Provider URL is invalid or unsafe.");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname.endsWith(".test")) {
    return;
  }

  await assertResolvablePublicHost(hostname);
}

function isSafeProviderUrl(url: URL) {
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
