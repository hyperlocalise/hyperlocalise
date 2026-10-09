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

import { remainingIntercomJobTargetLocales } from "./import-intercom-target-translations";
import { normalizeIntercomLocaleTag } from "./intercom-locale";

export const INTERCOM_IMPORT_OPEN_JOB_STATUSES = [
  "queued",
  "running",
  "waiting_for_review",
] as const;

export type IntercomOpenFileTranslationJob = {
  sourceFileId: string | null;
  targetLocales: readonly string[];
};

export function readFileTranslationJobSourceFileId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const sourceFileId = (payload as { sourceFileId?: unknown }).sourceFileId;
  return typeof sourceFileId === "string" && sourceFileId.trim().length > 0 ? sourceFileId : null;
}

export function readFileTranslationJobTargetLocales(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const targetLocales = (payload as { targetLocales?: unknown }).targetLocales;
  if (!Array.isArray(targetLocales)) {
    return [];
  }
  return targetLocales.filter(
    (locale): locale is string => typeof locale === "string" && locale.trim().length > 0,
  );
}

export function leftoverIntercomJobLocalesNotCoveredByOpenJobs(input: {
  leftoverLocales: readonly string[];
  openJobs: readonly IntercomOpenFileTranslationJob[];
  sourceFileId: string;
}): string[] {
  const covered = new Set<string>();
  for (const job of input.openJobs) {
    if (job.sourceFileId !== input.sourceFileId) {
      continue;
    }
    for (const locale of job.targetLocales) {
      covered.add(normalizeIntercomLocaleTag(locale).toLowerCase());
    }
  }
  return input.leftoverLocales.filter(
    (locale) => !covered.has(normalizeIntercomLocaleTag(locale).toLowerCase()),
  );
}

export function resolveIntercomImportJobTargetLocales(input: {
  createJobEnabled: boolean;
  useProjectTargetLocales: boolean;
  configuredTargetLocales: readonly string[];
  mappedJobTargetLocales: readonly string[];
  importedProjectLocales: readonly string[];
  pushReadyProjectLocales: readonly string[];
  sourceFileId: string | null;
  openJobs: readonly IntercomOpenFileTranslationJob[];
}): string[] {
  if (!input.createJobEnabled || !input.sourceFileId || input.mappedJobTargetLocales.length === 0) {
    return [];
  }

  const configuredJobLocales = input.useProjectTargetLocales
    ? [...input.mappedJobTargetLocales]
    : input.configuredTargetLocales.filter((locale) =>
        input.mappedJobTargetLocales.some(
          (mapped) =>
            normalizeIntercomLocaleTag(mapped).toLowerCase() ===
            normalizeIntercomLocaleTag(locale).toLowerCase(),
        ),
      );
  const leftoverLocales = remainingIntercomJobTargetLocales({
    jobTargetLocales: configuredJobLocales,
    importedProjectLocales: input.importedProjectLocales,
    pushReadyProjectLocales: input.pushReadyProjectLocales,
  });

  return leftoverIntercomJobLocalesNotCoveredByOpenJobs({
    leftoverLocales,
    openJobs: input.openJobs,
    sourceFileId: input.sourceFileId,
  });
}
