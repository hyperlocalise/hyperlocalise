import { requireProviderBaseUrl } from "@/lib/providers/provider-url-safety";

export const PHRASE_EU_BASE_URL = "https://api.phrase.com/v2";
export const PHRASE_US_BASE_URL = "https://api.us.app.phrase.com/v2";

export function resolvePhraseBaseUrl(input: {
  region?: string | null;
  baseUrl?: string | null;
}): string {
  const explicitBaseUrl = input.baseUrl?.trim();
  if (explicitBaseUrl) {
    const parsed = new URL(explicitBaseUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "cloud.memsource.com" || hostname.endsWith(".cloud.memsource.com")) {
      return hostname.startsWith("us.") ? PHRASE_US_BASE_URL : PHRASE_EU_BASE_URL;
    }

    return requireProviderBaseUrl(explicitBaseUrl, PHRASE_EU_BASE_URL, "Phrase");
  }

  const region = input.region?.trim().toLowerCase();
  if (region === "us" || region === "usa" || region === "united states") {
    return PHRASE_US_BASE_URL;
  }

  return PHRASE_EU_BASE_URL;
}
