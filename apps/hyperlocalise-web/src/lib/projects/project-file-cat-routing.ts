import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { supportsProviderCatFile } from "@/lib/providers/capabilities/provider-cat-capabilities";

export function canOpenProjectFileCat(file: ProjectFileRecord) {
  if (file.provider) {
    return supportsProviderCatFile(file);
  }

  return Boolean(file.storedFileId);
}

function normalizeTargetLocales(locales: readonly string[] | null | undefined) {
  if (!locales) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const locale of locales) {
    const trimmed = locale.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

export function resolveProjectFileCatTargetLocales(
  file: ProjectFileRecord,
  projectTargetLocales?: readonly string[] | null,
) {
  if (file.provider) {
    return normalizeTargetLocales(file.provider.targetLocales);
  }

  const configuredTargetLocales = normalizeTargetLocales(projectTargetLocales);
  if (projectTargetLocales != null || configuredTargetLocales.length > 0) {
    return configuredTargetLocales;
  }

  return normalizeTargetLocales(Object.keys(file.localeReadiness ?? {}));
}

export function resolveProjectFileCatTargetLocale(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
) {
  const targetLocales = resolveProjectFileCatTargetLocales(file, projectTargetLocales);
  if (highlightLocale && targetLocales.includes(highlightLocale)) {
    return highlightLocale;
  }

  if (!file.provider && targetLocales.length === 0 && projectTargetLocales == null) {
    return highlightLocale;
  }

  return targetLocales[0] ?? null;
}

function resolveProjectFileTargetLocale(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
) {
  return resolveProjectFileCatTargetLocale(file, highlightLocale, projectTargetLocales);
}

export type ProjectFileCatUrlParams = {
  sourcePath: string;
  locale?: string | null;
  segment?: string | null;
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
  branch?: string | null;
};

export function parseProjectFileCatSearchParams(searchParams: {
  sourcePath?: string;
  locale?: string;
  segment?: string;
  externalResourceId?: string;
  resourceType?: string;
  branch?: string;
}): {
  sourcePath: string | null;
  highlightLocale: string | null;
  initialSegmentKey: string | null;
  externalResourceId: string | null;
  resourceType: "file" | "key" | null;
  branch: string | null;
} {
  const resourceType =
    searchParams.resourceType === "file" || searchParams.resourceType === "key"
      ? searchParams.resourceType
      : null;

  return {
    sourcePath: searchParams.sourcePath?.trim() ? searchParams.sourcePath.trim() : null,
    highlightLocale: searchParams.locale?.trim() ? searchParams.locale.trim() : null,
    initialSegmentKey: searchParams.segment?.trim() ? searchParams.segment.trim() : null,
    externalResourceId: searchParams.externalResourceId?.trim()
      ? searchParams.externalResourceId.trim()
      : null,
    resourceType,
    branch: searchParams.branch?.trim() ? searchParams.branch.trim() : null,
  };
}

export function hasProjectFileCatIdentityFromUrl(params: {
  sourcePath: string | null;
  externalResourceId: string | null;
  highlightLocale: string | null;
}) {
  return Boolean(params.sourcePath && params.externalResourceId && params.highlightLocale);
}

export function buildProjectFileCatHref(
  organizationSlug: string,
  projectId: string,
  file: ProjectFileRecord,
  highlightLocale: string | null = null,
  branch: string | null = null,
  projectTargetLocales?: readonly string[] | null,
) {
  if (!canOpenProjectFileCat(file)) {
    return null;
  }

  const params = new URLSearchParams({
    sourcePath: file.sourcePath,
  });

  const targetLocale = resolveProjectFileTargetLocale(file, highlightLocale, projectTargetLocales);
  if (targetLocale) {
    params.set("locale", targetLocale);
  }

  const trimmedBranch = branch?.trim();
  if (trimmedBranch) {
    params.set("branch", trimmedBranch);
  }

  if (file.provider?.externalResourceId) {
    params.set("externalResourceId", file.provider.externalResourceId);
    if (file.provider.resourceType !== "file") {
      params.set("resourceType", file.provider.resourceType);
    }
  }

  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/cat`;
  return `${base}?${params.toString()}`;
}
