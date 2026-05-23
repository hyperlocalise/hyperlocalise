export const PHRASE_TMS_DEFAULT_BASE_URL = "https://cloud.memsource.com/web";

export function resolvePhraseTmsBaseUrl(input: { baseUrl?: string | null }): string {
  const explicitBaseUrl = input.baseUrl?.trim();
  if (!explicitBaseUrl) {
    return PHRASE_TMS_DEFAULT_BASE_URL;
  }

  const normalized = explicitBaseUrl.replace(/\/+$/, "");
  if (normalized.includes("memsource.com") || normalized.endsWith("/web")) {
    return normalized;
  }

  return PHRASE_TMS_DEFAULT_BASE_URL;
}
