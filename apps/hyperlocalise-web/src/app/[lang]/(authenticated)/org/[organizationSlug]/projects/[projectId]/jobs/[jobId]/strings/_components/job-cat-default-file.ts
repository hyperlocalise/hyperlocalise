import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { supportsProviderCatFile } from "@/lib/providers/provider-cat-capabilities";

import { selectJobCatTargetLocale } from "./job-cat-target-locale";

export type JobCatDefaultFileReference = {
  sourcePath: string | null;
  storedFileId: string | null;
  targetLocale: string;
};

function sortFilesByPath(files: ProjectFileRecord[]) {
  return [...files].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}

function resolveTargetLocale(file: ProjectFileRecord, requestedTargetLocale: string | null) {
  if (file.provider) {
    return selectJobCatTargetLocale({
      requestedTargetLocale,
      providerTargetLocales: file.provider.targetLocales,
    });
  }

  return requestedTargetLocale;
}

export function resolveDefaultJobCatFileReference(
  files: ProjectFileRecord[],
  requestedTargetLocale: string | null,
): JobCatDefaultFileReference | null {
  for (const file of sortFilesByPath(files)) {
    const targetLocale = resolveTargetLocale(file, requestedTargetLocale);
    if (!targetLocale) {
      continue;
    }

    if (supportsProviderCatFile(file)) {
      return {
        sourcePath: file.sourcePath,
        storedFileId: null,
        targetLocale,
      };
    }

    if (!file.provider && file.storedFileId) {
      return {
        sourcePath: null,
        storedFileId: file.storedFileId,
        targetLocale,
      };
    }
  }

  return null;
}
