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
import { supportsProviderCatFile } from "@/lib/providers/capabilities/provider-cat-capabilities";

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
