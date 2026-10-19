import type { HyperlocalisePluginOptions } from "./plugin-options";

declare const HYPERLOCALISE_APP_URL: string | undefined;

export type PluginSettings = {
  appUrl: string;
  accessToken?: string;
  refreshToken?: string;
  projectId?: string;
  selectedLocale?: string;
  selectedDocumentIds?: string[];
  lastJobId?: string | null;
};

export const DEFAULT_APP_URL =
  typeof HYPERLOCALISE_APP_URL === "string" && HYPERLOCALISE_APP_URL.length > 0
    ? HYPERLOCALISE_APP_URL
    : "http://localhost:3000";

const SETTINGS_KEY = "hyperlocalise:sanity-plugin:settings:v1";

export function settingsStorageKey(sanityProjectId: string, dataset: string) {
  return `${SETTINGS_KEY}:${sanityProjectId}:${dataset}`;
}

export function normalizeAppUrl(value: string): string {
  return value.trim().replace(/\/+$/, "") || DEFAULT_APP_URL;
}

export function loadSettings(sanityProjectId: string, dataset: string): PluginSettings {
  if (typeof localStorage === "undefined") {
    return { appUrl: DEFAULT_APP_URL };
  }
  try {
    const raw = localStorage.getItem(settingsStorageKey(sanityProjectId, dataset));
    if (!raw) {
      return { appUrl: DEFAULT_APP_URL };
    }
    const parsed = JSON.parse(raw) as PluginSettings;
    return {
      appUrl: normalizeAppUrl(parsed.appUrl ?? DEFAULT_APP_URL),
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      projectId: parsed.projectId,
      selectedLocale: parsed.selectedLocale,
      selectedDocumentIds: parsed.selectedDocumentIds ?? [],
      lastJobId: parsed.lastJobId ?? null,
    };
  } catch {
    return { appUrl: DEFAULT_APP_URL };
  }
}

export function saveSettings(
  sanityProjectId: string,
  dataset: string,
  settings: PluginSettings,
): PluginSettings {
  const next: PluginSettings = {
    ...settings,
    appUrl: normalizeAppUrl(settings.appUrl),
  };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(settingsStorageKey(sanityProjectId, dataset), JSON.stringify(next));
  }
  return next;
}

export type { HyperlocalisePluginOptions };
