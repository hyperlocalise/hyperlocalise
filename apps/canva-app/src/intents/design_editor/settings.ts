import type { AppSettings } from "./types";

const SETTINGS_STORAGE_KEY = "hyperlocalise:canva-app:settings:v1";

const defaultSettings: AppSettings = {
  projectId: "",
  sourceLocale: "en",
  targetLocales: "es,fr,de",
  preserveFormatting: true,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      projectId: parsed.projectId ?? defaultSettings.projectId,
      sourceLocale: parsed.sourceLocale ?? defaultSettings.sourceLocale,
      targetLocales: parsed.targetLocales ?? defaultSettings.targetLocales,
      preserveFormatting: parsed.preserveFormatting ?? defaultSettings.preserveFormatting,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota or private browsing errors.
  }
}

export function parseTargetLocales(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((locale) => locale.trim())
    .filter((locale) => locale.length > 0);
}
