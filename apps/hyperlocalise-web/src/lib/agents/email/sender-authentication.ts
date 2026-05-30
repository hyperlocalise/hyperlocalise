function normalizeHeaderMap(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function headerValues(headers: Record<string, string>, name: string): string[] {
  const value = headers[name.toLowerCase()];
  if (!value) return [];
  return [value];
}

function extractEmailAddress(value: string): string {
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed?.[1] ?? value).trim().toLowerCase();
}

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function spfPassedForDomain(headers: Record<string, string>, domain: string): boolean {
  for (const value of headerValues(headers, "received-spf")) {
    const normalized = value.toLowerCase();
    if (!normalized.includes(domain)) continue;
    if (/\bpass\b/.test(normalized) || /\bsoftfail\b/.test(normalized)) {
      return true;
    }
  }
  return false;
}

function authenticationResultsPass(headers: Record<string, string>, domain: string): boolean {
  for (const name of ["authentication-results", "arc-authentication-results"]) {
    for (const value of headerValues(headers, name)) {
      const normalized = value.toLowerCase();
      if (!normalized.includes(domain)) continue;
      const spfPass = /\bspf=pass\b/.test(normalized);
      const dkimPass = /\bdkim=pass\b/.test(normalized);
      const dmarcPass = /\b dmarc=pass\b/.test(normalized) || /\bdmarc=pass\b/.test(normalized);
      if (spfPass || dkimPass || dmarcPass) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true when Resend-provided headers indicate the claimed From address was sender-authenticated.
 */
export function isInboundSenderAuthenticated(input: {
  claimedFromEmail: string;
  headers?: Record<string, string>;
}): boolean {
  const claimed = extractEmailAddress(input.claimedFromEmail);
  const domain = domainFromEmail(claimed);
  if (!domain) return false;

  const headers = normalizeHeaderMap(input.headers);
  if (!headers || Object.keys(headers).length === 0) {
    return false;
  }

  return spfPassedForDomain(headers, domain) || authenticationResultsPass(headers, domain);
}
