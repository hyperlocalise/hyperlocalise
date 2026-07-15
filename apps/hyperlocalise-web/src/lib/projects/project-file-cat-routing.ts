import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  CAT_ALL_FILES_SOURCE_PATH,
  serializeCatSourcePathsFilter,
} from "@/lib/projects/cat-all-files";
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
  if (projectTargetLocales != null) {
    return configuredTargetLocales;
  }

  return normalizeTargetLocales(Object.keys(file.localeReadiness ?? {}));
}

export type ProjectFileCatTargetLocaleResolution = {
  requestedLocale: string | null;
  status: "exact" | "fallback" | "none";
  targetLocale: string | null;
  targetLocales: string[];
};

export function resolveProjectFileCatTargetLocaleResolution(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
): ProjectFileCatTargetLocaleResolution {
  const targetLocales = resolveProjectFileCatTargetLocales(file, projectTargetLocales);
  const requestedLocale = highlightLocale?.trim() ? highlightLocale.trim() : null;
  if (requestedLocale && targetLocales.includes(requestedLocale)) {
    return {
      requestedLocale,
      status: "exact",
      targetLocale: requestedLocale,
      targetLocales,
    };
  }

  if (
    !file.provider &&
    targetLocales.length === 0 &&
    projectTargetLocales == null &&
    requestedLocale
  ) {
    return {
      requestedLocale,
      status: "exact",
      targetLocale: requestedLocale,
      targetLocales,
    };
  }

  const fallbackLocale = targetLocales[0] ?? null;
  return {
    requestedLocale,
    status: fallbackLocale ? "fallback" : "none",
    targetLocale: fallbackLocale,
    targetLocales,
  };
}

export function resolveProjectFileCatTargetLocale(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
) {
  return resolveProjectFileCatTargetLocaleResolution(file, highlightLocale, projectTargetLocales)
    .targetLocale;
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
  sourcePaths?: string;
}): {
  sourcePath: string | null;
  allFiles: boolean;
  highlightLocale: string | null;
  initialSegmentKey: string | null;
  externalResourceId: string | null;
  resourceType: "file" | "key" | null;
  branch: string | null;
  sourcePaths: string | null;
} {
  const resourceType =
    searchParams.resourceType === "file" || searchParams.resourceType === "key"
      ? searchParams.resourceType
      : null;
  const rawSourcePath = searchParams.sourcePath?.trim() ? searchParams.sourcePath.trim() : null;
  const allFiles = rawSourcePath === CAT_ALL_FILES_SOURCE_PATH;

  return {
    sourcePath: allFiles ? null : rawSourcePath,
    allFiles,
    highlightLocale: searchParams.locale?.trim() ? searchParams.locale.trim() : null,
    initialSegmentKey: searchParams.segment?.trim() ? searchParams.segment.trim() : null,
    externalResourceId: searchParams.externalResourceId?.trim()
      ? searchParams.externalResourceId.trim()
      : null,
    resourceType,
    branch: searchParams.branch?.trim() ? searchParams.branch.trim() : null,
    sourcePaths: searchParams.sourcePaths?.trim() ? searchParams.sourcePaths.trim() : null,
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

export function buildProjectFileCatAllFilesHref(
  organizationSlug: string,
  projectId: string,
  locale: string | null = null,
  options?: {
    branch?: string | null;
    sourcePaths?: readonly string[] | null;
    basePath?: "files/cat" | "strings";
  },
) {
  const params = new URLSearchParams({
    sourcePath: CAT_ALL_FILES_SOURCE_PATH,
  });

  if (locale?.trim()) {
    params.set("locale", locale.trim());
  }

  const trimmedBranch = options?.branch?.trim();
  if (trimmedBranch) {
    params.set("branch", trimmedBranch);
  }

  if (options?.sourcePaths && options.sourcePaths.length > 0) {
    params.set("sourcePaths", serializeCatSourcePathsFilter(options.sourcePaths));
  }

  const section = options?.basePath ?? "files/cat";
  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/${section}`;
  return `${base}?${params.toString()}`;
}

export function buildProjectStringsHref(
  organizationSlug: string,
  projectId: string,
  locale: string | null = null,
) {
  return buildProjectFileCatAllFilesHref(organizationSlug, projectId, locale, {
    basePath: "strings",
  });
}

export function resolveProjectCatTargetLocale(
  projectTargetLocales: readonly string[] | null | undefined,
  highlightLocale: string | null,
) {
  const locales = (projectTargetLocales ?? []).map((locale) => locale.trim()).filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const locale of locales) {
    if (seen.has(locale)) continue;
    seen.add(locale);
    unique.push(locale);
  }

  if (highlightLocale?.trim() && unique.includes(highlightLocale.trim())) {
    return highlightLocale.trim();
  }

  return unique[0] ?? null;
}
