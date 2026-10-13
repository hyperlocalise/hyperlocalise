/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { AppSettings } from "./types";

const SETTINGS_STORAGE_KEY = "hyperlocalise:canva-app:settings:v8";
const LEGACY_SETTINGS_STORAGE_KEY = "hyperlocalise:canva-app:settings:v7";

const defaultSettings: AppSettings = {
  connectionToken: "",
  organizationSlug: "",
  organizationName: "",
  projectId: "",
  projectName: "",
  sourceLocale: "",
  targetLocales: "",
  preserveFormatting: true,
  selectedPageIndices: [],
  selectedLocale: "",
  designId: "",
  appliedLocaleByPage: {},
  lastJobId: "",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const raw =
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<AppSettings> & { appliedLocale?: string };
    return normalizeSettings(parsed);
  } catch {
    return defaultSettings;
  }
}

function normalizeAppliedLocaleByPage(
  parsed: Partial<AppSettings> & { appliedLocale?: string },
): Record<string, string> {
  if (parsed.appliedLocaleByPage && typeof parsed.appliedLocaleByPage === "object") {
    return Object.fromEntries(
      Object.entries(parsed.appliedLocaleByPage).filter(
        ([key, value]) => /^\d+$/.test(key) && typeof value === "string" && value.length > 0,
      ),
    );
  }
  return defaultSettings.appliedLocaleByPage;
}

function normalizeSettings(parsed: Partial<AppSettings> & { appliedLocale?: string }): AppSettings {
  return {
    connectionToken: parsed.connectionToken ?? defaultSettings.connectionToken,
    organizationSlug: parsed.organizationSlug ?? defaultSettings.organizationSlug,
    organizationName: parsed.organizationName ?? defaultSettings.organizationName,
    projectId: parsed.projectId ?? defaultSettings.projectId,
    projectName: parsed.projectName ?? defaultSettings.projectName,
    sourceLocale: parsed.sourceLocale ?? defaultSettings.sourceLocale,
    targetLocales: parsed.targetLocales ?? defaultSettings.targetLocales,
    preserveFormatting: parsed.preserveFormatting ?? defaultSettings.preserveFormatting,
    selectedPageIndices: Array.isArray(parsed.selectedPageIndices)
      ? parsed.selectedPageIndices.filter((index) => Number.isInteger(index))
      : defaultSettings.selectedPageIndices,
    selectedLocale: parsed.selectedLocale ?? defaultSettings.selectedLocale,
    designId: parsed.designId ?? defaultSettings.designId,
    appliedLocaleByPage: normalizeAppliedLocaleByPage(parsed),
    lastJobId: parsed.lastJobId ?? defaultSettings.lastJobId,
  };
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

export function projectLocalesToSettings(project: {
  sourceLocale: string;
  targetLocales: string[];
}): Pick<AppSettings, "sourceLocale" | "targetLocales"> {
  return {
    sourceLocale: project.sourceLocale,
    targetLocales: project.targetLocales.join(", "),
  };
}

export function parseSelectedPageValues(values: string[]): number[] {
  return values
    .map((value) => Number.parseInt(value, 10))
    .filter((index) => Number.isInteger(index));
}

export function selectedPagesShowSourceLocale(
  appliedLocaleByPage: Record<string, string>,
  selected: number[],
  sourceLocale: string,
) {
  if (!sourceLocale || selected.length === 0) {
    return false;
  }
  return selected.every((index) => {
    const applied = appliedLocaleByPage[String(index)] ?? "";
    return !applied || applied === sourceLocale;
  });
}

export function settingsForDesign(settings: AppSettings, designId: string): AppSettings {
  if (!designId || settings.designId === designId) {
    return settings.designId === designId ? settings : { ...settings, designId };
  }
  if (!settings.designId) {
    return { ...settings, designId };
  }
  return {
    ...settings,
    designId,
    appliedLocaleByPage: {},
  };
}

export function recordAppliedLocales(
  appliedLocaleByPage: Record<string, string>,
  pageIndices: number[],
  locale: string,
): Record<string, string> {
  if (pageIndices.length === 0 || !locale) {
    return appliedLocaleByPage;
  }
  const next = { ...appliedLocaleByPage };
  for (const index of pageIndices) {
    next[String(index)] = locale;
  }
  return next;
}
