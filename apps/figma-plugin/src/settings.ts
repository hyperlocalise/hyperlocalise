import type { PluginSettings } from "./plugin-messages";

declare const HYPERLOCALISE_APP_URL: string | undefined;

export const DEFAULT_APP_URL =
  typeof HYPERLOCALISE_APP_URL === "string" && HYPERLOCALISE_APP_URL.length > 0
    ? HYPERLOCALISE_APP_URL
    : "https://app.hyperlocalise.com";

export const DEFAULT_SETTINGS: PluginSettings = {
  appUrl: DEFAULT_APP_URL,
  accessToken: null,
  refreshToken: null,
  connectionToken: null,
  personalAccessToken: null,
  userEmail: null,
  organizationSlug: "",
  organizationName: null,
  projectId: "",
  selectedLocale: "es",
  selectedPageIds: [],
  preserveFormatting: true,
  lastJobId: null,
  appliedLocaleByPage: {},
};

export function selectedPagesShowSourceLocale(
  appliedLocaleByPage: Record<string, string>,
  selected: string[],
  sourceLocale: string,
) {
  if (!sourceLocale || selected.length === 0) {
    return false;
  }
  return selected.every((pageId) => {
    const applied = appliedLocaleByPage[pageId] ?? "";
    return !applied || applied === sourceLocale;
  });
}

export function recordAppliedLocales(
  appliedLocaleByPage: Record<string, string>,
  pageIds: string[],
  locale: string,
): Record<string, string> {
  if (pageIds.length === 0 || !locale) {
    return appliedLocaleByPage;
  }
  const next = { ...appliedLocaleByPage };
  for (const pageId of pageIds) {
    next[pageId] = locale;
  }
  return next;
}

export function normalizeAppUrl(value: string): string {
  return value.trim().replace(/\/+$/, "") || DEFAULT_APP_URL;
}

export function resolvePersistedProjectId(
  savedProjectId: string,
  projects: Array<{ id: string }>,
): string {
  return savedProjectId && projects.some((project) => project.id === savedProjectId)
    ? savedProjectId
    : "";
}

function readPersonalAccessToken(candidate: Partial<PluginSettings> & { sealedSession?: unknown }) {
  if (typeof candidate.personalAccessToken === "string" && candidate.personalAccessToken.trim()) {
    return candidate.personalAccessToken.trim();
  }

  return null;
}

/** True when stored plugin settings still hold a WorkOS sealed session. */
export function hadLegacyFigmaSession(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { sealedSession?: unknown; personalAccessToken?: unknown };
  const hasLegacySession =
    typeof candidate.sealedSession === "string" && candidate.sealedSession.trim().length > 0;
  const hasPat =
    typeof candidate.personalAccessToken === "string" &&
    candidate.personalAccessToken.trim().length > 0;

  return hasLegacySession && !hasPat;
}

export function mergeSettings(value: unknown): PluginSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const candidate = value as Partial<PluginSettings> & {
    sealedSession?: unknown;
    /** @deprecated Removed from plugin settings. */
    sourceLocale?: unknown;
    /** @deprecated Removed from plugin settings. */
    targetLocales?: unknown;
  };
  const legacyPat = readPersonalAccessToken(candidate);
  return {
    appUrl: DEFAULT_APP_URL,
    accessToken:
      typeof candidate.accessToken === "string" && candidate.accessToken.trim()
        ? candidate.accessToken.trim()
        : null,
    refreshToken:
      typeof candidate.refreshToken === "string" && candidate.refreshToken.trim()
        ? candidate.refreshToken.trim()
        : null,
    connectionToken:
      typeof candidate.connectionToken === "string" && candidate.connectionToken.trim()
        ? candidate.connectionToken.trim()
        : legacyPat,
    personalAccessToken: legacyPat,
    userEmail: candidate.userEmail ?? null,
    organizationSlug: candidate.organizationSlug ?? DEFAULT_SETTINGS.organizationSlug,
    organizationName: candidate.organizationName ?? null,
    projectId: candidate.projectId ?? DEFAULT_SETTINGS.projectId,
    selectedLocale:
      typeof candidate.selectedLocale === "string" && candidate.selectedLocale.trim()
        ? candidate.selectedLocale.trim()
        : Array.isArray(candidate.targetLocales) &&
            typeof candidate.targetLocales[0] === "string" &&
            candidate.targetLocales[0].trim()
          ? candidate.targetLocales[0].trim()
          : DEFAULT_SETTINGS.selectedLocale,
    selectedPageIds: Array.isArray(candidate.selectedPageIds)
      ? candidate.selectedPageIds
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim())
      : DEFAULT_SETTINGS.selectedPageIds,
    preserveFormatting:
      typeof candidate.preserveFormatting === "boolean"
        ? candidate.preserveFormatting
        : DEFAULT_SETTINGS.preserveFormatting,
    lastJobId: candidate.lastJobId ?? null,
    appliedLocaleByPage:
      candidate.appliedLocaleByPage && typeof candidate.appliedLocaleByPage === "object"
        ? Object.fromEntries(
            Object.entries(candidate.appliedLocaleByPage).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === "string" &&
                typeof entry[1] === "string" &&
                entry[0].trim().length > 0 &&
                entry[1].trim().length > 0,
            ),
          )
        : DEFAULT_SETTINGS.appliedLocaleByPage,
  };
}
