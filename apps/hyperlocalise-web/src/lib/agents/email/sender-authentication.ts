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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spfPassedForDomain(headers: Record<string, string>, domain: string): boolean {
  const domainPattern = new RegExp(`@${escapeRegex(domain)}(?![.\\w])`, "i");
  for (const value of headerValues(headers, "received-spf")) {
    const normalized = value.toLowerCase();
    if (!domainPattern.test(normalized)) continue;
    if (/\bpass\b/.test(normalized)) {
      return true;
    }
  }
  return false;
}

function authenticationResultsPass(headers: Record<string, string>, domain: string): boolean {
  const escapedDomain = escapeRegex(domain);
  const domainEnd = `(?![.\\w])`;
  const dkimPassForDomain = new RegExp(
    `\\bdkim=pass\\b[^;]*header\\.d=${escapedDomain}${domainEnd}`,
  );
  const dmarcPassForDomain = new RegExp(
    `\\bdmarc=pass\\b[^;]*header\\.from=(?:\\S+@)?${escapedDomain}${domainEnd}`,
  );
  const spfPassForDomain = new RegExp(
    `\\bspf=pass\\b[^;]*(?:smtp\\.)?mailfrom=(?:\\S+@)?${escapedDomain}${domainEnd}`,
  );
  const spfPassForDomainComment = new RegExp(
    `\\bspf=pass\\b\\s*\\(\\s*${escapedDomain}${domainEnd}:`,
  );

  for (const name of ["authentication-results", "arc-authentication-results"]) {
    for (const value of headerValues(headers, name)) {
      const normalized = value.toLowerCase();
      if (
        dkimPassForDomain.test(normalized) ||
        dmarcPassForDomain.test(normalized) ||
        spfPassForDomain.test(normalized) ||
        spfPassForDomainComment.test(normalized)
      ) {
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
