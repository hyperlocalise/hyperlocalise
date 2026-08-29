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
import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import {
  CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
  serializeCatSourcePathsFilter,
} from "@/lib/projects/content-editor-all-files";
import { supportsProviderContentEditorFile } from "@/lib/providers/capabilities/provider-content-editor-capabilities";

export function canOpenProjectFileContentEditor(file: ProjectFileRecord) {
  if (file.provider) {
    return supportsProviderContentEditorFile(file);
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

export function resolveProjectFileContentEditorTargetLocales(
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

export type ProjectFileContentEditorTargetLocaleResolution = {
  requestedLocale: string | null;
  status: "exact" | "fallback" | "none";
  targetLocale: string | null;
  targetLocales: string[];
};

export function resolveProjectFileContentEditorTargetLocaleResolution(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
): ProjectFileContentEditorTargetLocaleResolution {
  const targetLocales = resolveProjectFileContentEditorTargetLocales(file, projectTargetLocales);
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

export function resolveProjectFileContentEditorTargetLocale(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
) {
  return resolveProjectFileContentEditorTargetLocaleResolution(
    file,
    highlightLocale,
    projectTargetLocales,
  ).targetLocale;
}

function resolveProjectFileTargetLocale(
  file: ProjectFileRecord,
  highlightLocale: string | null,
  projectTargetLocales?: readonly string[] | null,
) {
  return resolveProjectFileContentEditorTargetLocale(file, highlightLocale, projectTargetLocales);
}

export type ProjectFileContentEditorUrlParams = {
  sourcePath: string;
  locale?: string | null;
  segment?: string | null;
  externalResourceId?: string | null;
  resourceType?: "file" | "key" | null;
  branch?: string | null;
};

export function parseProjectFileContentEditorSearchParams(searchParams: {
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
  const allFiles = rawSourcePath === CONTENT_EDITOR_ALL_FILES_SOURCE_PATH;

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

export function hasProjectFileContentEditorIdentityFromUrl(params: {
  sourcePath: string | null;
  externalResourceId: string | null;
  highlightLocale: string | null;
}) {
  return Boolean(params.sourcePath && params.externalResourceId && params.highlightLocale);
}

export function buildProjectFileContentEditorHref(
  organizationSlug: string,
  projectId: string,
  file: ProjectFileRecord,
  highlightLocale: string | null = null,
  branch: string | null = null,
  projectTargetLocales?: readonly string[] | null,
) {
  if (!canOpenProjectFileContentEditor(file)) {
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

  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/content-editor`;
  return `${base}?${params.toString()}`;
}

export function buildProjectFileContentEditorAllFilesHref(
  organizationSlug: string,
  projectId: string,
  locale: string | null = null,
  options?: {
    branch?: string | null;
    sourcePaths?: readonly string[] | null;
    basePath?: "files/content-editor" | "strings";
  },
) {
  const params = new URLSearchParams({
    sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
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

  const section = options?.basePath ?? "files/content-editor";
  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/${section}`;
  return `${base}?${params.toString()}`;
}

export function buildProjectStringsHref(
  organizationSlug: string,
  projectId: string,
  locale: string | null = null,
) {
  return buildProjectFileContentEditorAllFilesHref(organizationSlug, projectId, locale, {
    basePath: "strings",
  });
}

export function resolveProjectContentEditorTargetLocale(
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
