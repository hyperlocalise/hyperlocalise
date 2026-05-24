export const TMS_PROVIDER_KINDS = ["crowdin", "smartling", "phrase", "lokalise"] as const;

export const PROJECT_SOURCE_FILTERS = ["native", "external_tms"] as const;
export const FILE_ORIGIN_FILTERS = ["repository", "provider", "combined"] as const;
export const FILE_SYNC_FILTERS = ["synced", "pending", "stale", "changed"] as const;
export const GLOSSARY_SYNC_FILTERS = ["synced", "stale", "syncing", "error"] as const;
export const JOB_SOURCE_FILTERS = ["native", "provider"] as const;
export const JOB_STATUS_FILTERS = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "waiting_for_review",
  "cancelled",
] as const;

export type TmsProviderKind = (typeof TMS_PROVIDER_KINDS)[number];

export function isTmsProviderKind(value: string | null): value is TmsProviderKind {
  return value != null && (TMS_PROVIDER_KINDS as readonly string[]).includes(value);
}

export function readWorkspaceFilterParam(
  searchParams: URLSearchParams,
  key: string,
  allowed: readonly string[],
  fallback = "all",
) {
  const value = searchParams.get(key);
  if (value && allowed.includes(value)) {
    return value;
  }
  return fallback;
}

export function buildWorkspaceHref(
  path: string,
  params: Record<string, string | undefined | null>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function buildOrgWorkspaceHref(
  organizationSlug: string,
  section:
    | "projects"
    | "files"
    | "jobs"
    | "glossaries"
    | "translation-memories"
    | "context"
    | "integrations",
  params?: Record<string, string | undefined | null>,
) {
  return buildWorkspaceHref(`/org/${organizationSlug}/${section}`, params ?? {});
}
