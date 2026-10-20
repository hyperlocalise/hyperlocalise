import {isRecord, readString} from './json'
import type {HyperlocalisePluginOptions} from './plugin-options'

declare const HYPERLOCALISE_APP_URL: string | undefined

export type PluginSettings = {
  appUrl: string
  accessToken?: string
  refreshToken?: string
  projectId?: string
  selectedLocale?: string
  selectedDocumentIds?: string[]
  lastJobId?: string | null
}

export const DEFAULT_APP_URL =
  typeof HYPERLOCALISE_APP_URL === 'string' && HYPERLOCALISE_APP_URL.length > 0
    ? HYPERLOCALISE_APP_URL
    : 'http://localhost:3000'

const SETTINGS_KEY = 'hyperlocalise:sanity-plugin:settings:v1'

export function settingsStorageKey(sanityProjectId: string, dataset: string) {
  return `${SETTINGS_KEY}:${sanityProjectId}:${dataset}`
}

export function normalizeAppUrl(value: string): string {
  return value.trim().replace(/\/+$/, '') || DEFAULT_APP_URL
}

export function loadSettings(sanityProjectId: string, dataset: string): PluginSettings {
  if (typeof localStorage === 'undefined') {
    return {appUrl: DEFAULT_APP_URL}
  }
  try {
    const raw = localStorage.getItem(settingsStorageKey(sanityProjectId, dataset))
    if (!raw) {
      return {appUrl: DEFAULT_APP_URL}
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return {appUrl: DEFAULT_APP_URL}
    }
    return {
      appUrl: normalizeAppUrl(readString(parsed.appUrl) ?? DEFAULT_APP_URL),
      accessToken: readString(parsed.accessToken),
      refreshToken: readString(parsed.refreshToken),
      projectId: readString(parsed.projectId),
      selectedLocale: readString(parsed.selectedLocale),
      selectedDocumentIds: Array.isArray(parsed.selectedDocumentIds)
        ? parsed.selectedDocumentIds.filter((id): id is string => typeof id === 'string')
        : [],
      lastJobId: parsed.lastJobId === null ? null : readString(parsed.lastJobId),
    }
  } catch {
    return {appUrl: DEFAULT_APP_URL}
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
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(settingsStorageKey(sanityProjectId, dataset), JSON.stringify(next))
  }
  return next
}

export type {HyperlocalisePluginOptions}
