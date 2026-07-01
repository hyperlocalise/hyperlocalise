import {
  normalizeProviderBaseUrl,
  requireProviderBaseUrl,
} from "@/lib/providers/provider-url-safety";

export const CROWDIN_DEFAULT_API_BASE_URL = "https://api.crowdin.com/api/v2";

export function resolveCrowdinApiBaseUrl(baseUrl?: string | null): string {
  return requireProviderBaseUrl(baseUrl, CROWDIN_DEFAULT_API_BASE_URL, "Crowdin");
}

export function normalizeCrowdinApiBaseUrl(baseUrl?: string | null): string | null {
  return normalizeProviderBaseUrl(baseUrl, CROWDIN_DEFAULT_API_BASE_URL);
}

export function crowdinAuthenticatedUserUrl(baseUrl?: string | null): string | null {
  const normalized = normalizeCrowdinApiBaseUrl(baseUrl);
  if (!normalized) {
    return null;
  }

  return `${normalized}/user`;
}

export function isCrowdinEnterpriseApiBaseUrl(baseUrl?: string | null): boolean {
  const normalized = normalizeCrowdinApiBaseUrl(baseUrl);
  if (!normalized) {
    return false;
  }

  return new URL(normalized).hostname !== "api.crowdin.com";
}
