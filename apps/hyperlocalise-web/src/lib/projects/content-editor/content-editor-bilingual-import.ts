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
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";
import { readApiResponseError } from "@/lib/api-error";

import type { ContentEditorFilteredExportRow } from "./content-editor-filtered-export";

export type CatBilingualImportCounts = {
  matched: number;
  imported: number;
  skipped: number;
  files: number;
};

export function localesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function groupCatBilingualImportEntries(input: {
  rows: readonly ContentEditorFilteredExportRow[];
  sourcePath: string;
  targetLocale: string;
}): { entriesByPath: Map<string, Record<string, string>>; skipped: number } {
  const allFiles = isContentEditorAllFilesSourcePath(input.sourcePath);
  const fallbackPath = allFiles ? "" : input.sourcePath.trim();
  const entriesByPath = new Map<string, Record<string, string>>();
  let skipped = 0;

  for (const row of input.rows) {
    const key = row.key.trim();
    const target = row.targetText;
    if (!key || !target.trim()) {
      skipped += 1;
      continue;
    }
    if (row.targetLocale.trim() && !localesMatch(row.targetLocale, input.targetLocale)) {
      skipped += 1;
      continue;
    }
    const sourcePath = row.sourcePath?.trim() || fallbackPath;
    if (!sourcePath) {
      skipped += 1;
      continue;
    }
    if (!allFiles && sourcePath !== fallbackPath) {
      skipped += 1;
      continue;
    }
    const entries = entriesByPath.get(sourcePath) ?? {};
    entries[key] = target;
    entriesByPath.set(sourcePath, entries);
  }

  return { entriesByPath, skipped };
}

export function catBilingualImportApiPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/files/bilingual/import`;
}

export async function postCatBilingualImport(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  locale: string;
  file: File;
  fallbackMessage: string;
}): Promise<CatBilingualImportCounts> {
  const form = new FormData();
  form.set("sourcePath", input.sourcePath);
  form.set("locale", input.locale);
  form.set("file", input.file);

  const response = await fetch(catBilingualImportApiPath(input.organizationSlug, input.projectId), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw await readApiResponseError(response, input.fallbackMessage);
  }

  const body: unknown = await response.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !("import" in body) ||
    !isCatBilingualImportCounts((body as { import: unknown }).import)
  ) {
    throw new Error(input.fallbackMessage);
  }
  return (body as { import: CatBilingualImportCounts }).import;
}

function isCatBilingualImportCounts(value: unknown): value is CatBilingualImportCounts {
  if (!value || typeof value !== "object") {
    return false;
  }
  const counts = value as CatBilingualImportCounts;
  return (
    typeof counts.matched === "number" &&
    typeof counts.imported === "number" &&
    typeof counts.skipped === "number" &&
    typeof counts.files === "number"
  );
}
