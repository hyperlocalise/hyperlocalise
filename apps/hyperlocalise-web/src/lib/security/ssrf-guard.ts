import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type SsrfGuardError =
  | { code: "invalid_url" }
  | { code: "unsupported_protocol" }
  | { code: "credentials_in_url" }
  | { code: "blocked_host" }
  | { code: "host_not_allowed" }
  | { code: "host_unresolvable" }
  | { code: "host_resolves_to_restricted_address" };

export function formatSsrfGuardError(error: SsrfGuardError): string {
  switch (error.code) {
    case "invalid_url":
      return "URL is invalid.";
    case "unsupported_protocol":
      return "URL must use http or https.";
    case "credentials_in_url":
      return "URL must not include credentials.";
    case "blocked_host":
      return "URL host is not allowed.";
    case "host_not_allowed":
      return "URL host is not allowed.";
    case "host_unresolvable":
      return "URL host could not be resolved.";
    case "host_resolves_to_restricted_address":
      return "URL host resolves to a private or restricted address.";
    default:
      return assertNever(error);
  }
}

export function normalizeHostname(hostname: string): string {
  const lowerHostname = hostname.toLowerCase();
  if (lowerHostname.startsWith("[") && lowerHostname.endsWith("]")) {
    return lowerHostname.slice(1, -1);
  }
  return lowerHostname.replace(/\.$/, "");
}

function parseIpv4Octets(hostname: string): number[] | null {
  const octets = hostname.split(".");
  if (octets.length !== 4) return null;
  const bytes = octets.map((octet) => Number(octet));
  if (
    bytes.some(
      (byte, index) => !Number.isInteger(byte) || byte < 0 || byte > 255 || octets[index] === "",
    )
  ) {
    return null;
  }
  return bytes;
}

export function isBlockedIpv4Address(hostname: string): boolean {
  const bytes = parseIpv4Octets(hostname);
  if (!bytes) return false;

  const [first, second, third] = bytes;
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

function ipv4FromIpv4MappedIpv6(hostname: string): string | null {
  if (!/^::ffff:/i.test(hostname)) {
    return null;
  }

  const rest = hostname.slice(7);
  if (rest.includes(".")) {
    return rest;
  }

  const [highPart, lowPart] = rest.split(":");
  if (!highPart || !lowPart) {
    return null;
  }

  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);
  if (Number.isNaN(high) || Number.isNaN(low)) {
    return null;
  }

  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

export function isBlockedIpv6Address(hostname: string): boolean {
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
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fe8") ||
    hostname.startsWith("fe9") ||
    hostname.startsWith("fea") ||
    hostname.startsWith("feb")
  ) {
    return true;
  }

  const mappedIpv4 = ipv4FromIpv4MappedIpv6(hostname);
  if (mappedIpv4 && isBlockedIpv4Address(mappedIpv4)) {
    return true;
  }

  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (parseIpv4Octets(normalized)) {
    return isBlockedIpv4Address(normalized);
  }

  if (normalized.includes(":")) {
    return isBlockedIpv6Address(normalized);
  }

  return false;
}

export function validatePublicHttpUrl(value: string): Result<URL, SsrfGuardError> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return err({ code: "invalid_url" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return err({ code: "unsupported_protocol" });
  }

  if (parsed.username || parsed.password) {
    return err({ code: "credentials_in_url" });
  }

  if (isBlockedHost(parsed.hostname)) {
    return err({ code: "blocked_host" });
  }

  return ok(parsed);
}

export function isPublicHttpUrl(value: string): boolean {
  return validatePublicHttpUrl(value).ok;
}
