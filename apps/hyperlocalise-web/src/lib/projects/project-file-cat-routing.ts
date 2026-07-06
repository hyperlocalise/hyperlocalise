import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { supportsProviderCatFile } from "@/lib/providers/capabilities/provider-cat-capabilities";

export function canOpenProjectFileCat(file: ProjectFileRecord) {
  if (file.provider) {
    return supportsProviderCatFile(file);
  }

  return Boolean(file.storedFileId);
}

export function resolveProjectFileCatTargetLocale(
  file: ProjectFileRecord,
  highlightLocale: string | null,
) {
  if (file.provider) {
    if (highlightLocale && file.provider.targetLocales.includes(highlightLocale)) {
      return highlightLocale;
    }

    return file.provider.targetLocales[0] ?? null;
  }

  return highlightLocale;
}

function resolveProjectFileTargetLocale(file: ProjectFileRecord, highlightLocale: string | null) {
  return resolveProjectFileCatTargetLocale(file, highlightLocale);
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
) {
  if (!canOpenProjectFileCat(file)) {
    return null;
  }

  const params = new URLSearchParams({
    sourcePath: file.sourcePath,
  });

  const targetLocale = resolveProjectFileTargetLocale(file, highlightLocale);
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
