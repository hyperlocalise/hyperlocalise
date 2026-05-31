import { normalizeProviderBaseUrl } from "@/lib/providers/provider-url-safety";

export const PHRASE_TMS_DEFAULT_BASE_URL = "https://cloud.memsource.com/web";

export function resolvePhraseTmsBaseUrl(input: { baseUrl?: string | null }): string {
  const explicitBaseUrl = input.baseUrl?.trim();
  if (!explicitBaseUrl) {
    return PHRASE_TMS_DEFAULT_BASE_URL;
  }

  const normalized = normalizeProviderBaseUrl(explicitBaseUrl, PHRASE_TMS_DEFAULT_BASE_URL);
  if (!normalized) return PHRASE_TMS_DEFAULT_BASE_URL;

  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    const isMemsourceHost = hostname === "memsource.com" || hostname.endsWith(".memsource.com");

    if (isMemsourceHost) {
      return normalized;
    }
  } catch {
    // Invalid URL: fall back to default base URL.
  }

  return PHRASE_TMS_DEFAULT_BASE_URL;
}
