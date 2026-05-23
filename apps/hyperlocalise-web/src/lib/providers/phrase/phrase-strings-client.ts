import { PHRASE_EU_BASE_URL, PHRASE_US_BASE_URL } from "./phrase-base-url";
import { PhraseApiClient } from "./phrase-api";

export function createPhraseStringsApiClient(input: {
  token: string;
  region?: string | null;
  baseUrl?: string | null;
}) {
  return new PhraseApiClient({
    token: input.token,
    region: input.region,
    baseUrl: resolvePhraseStringsApiBaseUrl(input.baseUrl),
  });
}

function resolvePhraseStringsApiBaseUrl(baseUrl?: string | null) {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === PHRASE_EU_BASE_URL || trimmed === PHRASE_US_BASE_URL) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const allowedHosts = new Set(["api.phrase.com", "api.us.app.phrase.com"]);

    if (parsed.protocol === "https:" && allowedHosts.has(parsed.hostname)) {
      return trimmed.replace(/\/+$/, "");
    }
  } catch {
    return null;
  }

  return null;
}
