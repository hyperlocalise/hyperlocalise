import type { PluginSettings } from "./plugin-messages";

declare const HYPERLOCALISE_APP_URL: string | undefined;

export const DEFAULT_APP_URL =
  typeof HYPERLOCALISE_APP_URL === "string" && HYPERLOCALISE_APP_URL.length > 0
    ? HYPERLOCALISE_APP_URL
    : "https://app.hyperlocalise.com";

export const DEFAULT_SETTINGS: PluginSettings = {
  appUrl: DEFAULT_APP_URL,
  personalAccessToken: null,
  userEmail: null,
  organizationSlug: "",
  organizationName: null,
  projectId: "",
  sourceLocale: "en",
  targetLocales: ["es"],
  preserveFormatting: true,
  lastJobId: null,
};

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

  const candidate = value as Partial<PluginSettings> & { sealedSession?: unknown };
  return {
    appUrl: normalizeAppUrl(candidate.appUrl ?? DEFAULT_SETTINGS.appUrl),
    personalAccessToken: readPersonalAccessToken(candidate),
    userEmail: candidate.userEmail ?? null,
    organizationSlug: candidate.organizationSlug ?? DEFAULT_SETTINGS.organizationSlug,
    organizationName: candidate.organizationName ?? null,
    projectId: candidate.projectId ?? DEFAULT_SETTINGS.projectId,
    sourceLocale: candidate.sourceLocale ?? DEFAULT_SETTINGS.sourceLocale,
    targetLocales: Array.isArray(candidate.targetLocales)
      ? candidate.targetLocales.filter((locale) => typeof locale === "string" && locale.trim())
      : DEFAULT_SETTINGS.targetLocales,
    preserveFormatting:
      typeof candidate.preserveFormatting === "boolean"
        ? candidate.preserveFormatting
        : DEFAULT_SETTINGS.preserveFormatting,
    lastJobId: candidate.lastJobId ?? null,
  };
}
