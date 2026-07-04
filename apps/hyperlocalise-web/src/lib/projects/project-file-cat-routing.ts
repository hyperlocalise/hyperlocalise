import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";

export function canOpenProjectFileCat(file: ProjectFileRecord) {
  if (file.provider) {
    return supportsProviderCatFile(file);
  }

  return Boolean(file.storedFileId);
}

function resolveProjectFileTargetLocale(file: ProjectFileRecord, highlightLocale: string | null) {
  if (file.provider) {
    if (highlightLocale && file.provider.targetLocales.includes(highlightLocale)) {
      return highlightLocale;
    }

    return file.provider.targetLocales[0] ?? null;
  }

  return highlightLocale;
}

export function buildProjectFileCatHref(
  organizationSlug: string,
  projectId: string,
  file: ProjectFileRecord,
  highlightLocale: string | null = null,
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

  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/files/cat`;
  return `${base}?${params.toString()}`;
}
