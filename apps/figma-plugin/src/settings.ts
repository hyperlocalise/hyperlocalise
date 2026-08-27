import type { PluginSettings } from "./plugin-messages";

declare const HYPERLOCALISE_APP_URL: string | undefined;

export const DEFAULT_APP_URL =
  typeof HYPERLOCALISE_APP_URL === "string" && HYPERLOCALISE_APP_URL.length > 0
    ? HYPERLOCALISE_APP_URL
    : "https://app.hyperlocalise.com";

export const DEFAULT_SETTINGS: PluginSettings = {
  appUrl: DEFAULT_APP_URL,
  sealedSession: null,
  userEmail: null,
  organizationSlug: "",
  projectId: "",
  sourceLocale: "en",
  targetLocales: ["es"],
  preserveFormatting: true,
  lastJobId: null,
};

export function normalizeAppUrl(value: string): string {
  return value.trim().replace(/\/+$/, "") || DEFAULT_APP_URL;
}

export function mergeSettings(value: unknown): PluginSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const candidate = value as Partial<PluginSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    appUrl: normalizeAppUrl(candidate.appUrl ?? DEFAULT_SETTINGS.appUrl),
    targetLocales: Array.isArray(candidate.targetLocales)
      ? candidate.targetLocales.filter((locale) => typeof locale === "string" && locale.trim())
      : DEFAULT_SETTINGS.targetLocales,
    sealedSession: candidate.sealedSession ?? null,
    userEmail: candidate.userEmail ?? null,
    lastJobId: candidate.lastJobId ?? null,
  };
}
