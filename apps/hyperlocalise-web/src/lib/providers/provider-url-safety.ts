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

function isSafeProviderUrl(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false;
  if (!hostname.includes(".") && !hostname.includes(":")) return false;

  if (isBlockedIpv4Address(hostname) || isBlockedIpv6Address(hostname)) return false;

  return true;
}

function normalizeHostname(hostname: string) {
  return hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isBlockedIpv4Address(hostname: string) {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;

  const bytes = octets.map((octet) => Number(octet));
  if (
    bytes.some(
      (byte, index) => !Number.isInteger(byte) || byte < 0 || byte > 255 || octets[index] === "",
    )
  ) {
    return false;
  }

  const [first, second, third] = bytes as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113)
  );
}

function isBlockedIpv6Address(hostname: string) {
  if (!hostname.includes(":")) return false;

  if (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("::ffff:") ||
    hostname.startsWith("64:ff9b:") ||
    hostname.startsWith("100:") ||
    hostname.startsWith("2001:2:") ||
    hostname.startsWith("2001:db8:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe8") ||
    hostname.startsWith("fe9") ||
    hostname.startsWith("fea") ||
    hostname.startsWith("feb")
  ) {
    return true;
  }

  return false;
}
