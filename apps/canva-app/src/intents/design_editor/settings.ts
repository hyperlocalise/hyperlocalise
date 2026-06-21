import type { AppSettings } from "./types";

const SETTINGS_STORAGE_KEY = "hyperlocalise:canva-app:settings:v3";

const defaultSettings: AppSettings = {
  connectionToken: "",
  projectId: "",
  sourceLocale: "en",
  targetLocales: "es,fr,de",
  preserveFormatting: true,
  selectedPageIndices: [],
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return loadLegacySettings();
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      connectionToken: parsed.connectionToken ?? defaultSettings.connectionToken,
      projectId: parsed.projectId ?? defaultSettings.projectId,
      sourceLocale: parsed.sourceLocale ?? defaultSettings.sourceLocale,
      targetLocales: parsed.targetLocales ?? defaultSettings.targetLocales,
      preserveFormatting: parsed.preserveFormatting ?? defaultSettings.preserveFormatting,
      selectedPageIndices: Array.isArray(parsed.selectedPageIndices)
        ? parsed.selectedPageIndices.filter((index) => Number.isInteger(index))
        : defaultSettings.selectedPageIndices,
    };
  } catch {
    return defaultSettings;
  }
}

function loadLegacySettings(): AppSettings {
  try {
    const raw =
      window.localStorage.getItem("hyperlocalise:canva-app:settings:v2") ??
      window.localStorage.getItem("hyperlocalise:canva-app:settings:v1");
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      connectionToken: parsed.connectionToken ?? defaultSettings.connectionToken,
      projectId: parsed.projectId ?? defaultSettings.projectId,
      sourceLocale: parsed.sourceLocale ?? defaultSettings.sourceLocale,
      targetLocales: parsed.targetLocales ?? defaultSettings.targetLocales,
      preserveFormatting: parsed.preserveFormatting ?? defaultSettings.preserveFormatting,
      selectedPageIndices: Array.isArray(parsed.selectedPageIndices)
        ? parsed.selectedPageIndices.filter((index) => Number.isInteger(index))
        : defaultSettings.selectedPageIndices,
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

export function selectedPageValues(pageIndices: number[]): string[] {
  return pageIndices.map((index) => String(index));
}

export function parseSelectedPageValues(values: string[]): number[] {
  return values
    .map((value) => Number.parseInt(value, 10))
    .filter((index) => Number.isInteger(index));
}
