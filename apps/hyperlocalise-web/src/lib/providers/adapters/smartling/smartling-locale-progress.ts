import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import type { SmartlingApiClient, SmartlingFileLocaleStatus } from "./smartling-api";

export function mapSmartlingFileLocaleStatusToReadiness(
  statuses: SmartlingFileLocaleStatus[],
): Record<string, unknown> {
  const localeReadiness: Record<string, unknown> = {};

  for (const status of statuses) {
    const existing = localeReadiness[status.localeId];
    const completed = status.completedStringCount ?? 0;
    const authorized = status.authorizedStringCount ?? 0;

    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      const record = existing as Record<string, unknown>;
      localeReadiness[status.localeId] = {
        completedStringCount: Number(record.completedStringCount ?? 0) + completed,
        authorizedStringCount: Number(record.authorizedStringCount ?? 0) + authorized,
        lastCompleted: status.lastCompleted ?? record.lastCompleted ?? null,
        lastAuthorized: status.lastAuthorized ?? record.lastAuthorized ?? null,
      };
      continue;
    }

    localeReadiness[status.localeId] = {
      completedStringCount: completed,
      authorizedStringCount: authorized,
      lastCompleted: status.lastCompleted ?? null,
      lastAuthorized: status.lastAuthorized ?? null,
    };
  }

  return localeReadiness;
}

export async function loadSmartlingProjectLocaleReadiness(input: {
  client: SmartlingApiClient;
  projectId: string;
  languageId?: string;
}): Promise<Record<string, unknown>> {
  const files = await input.client.listProjectFiles(input.projectId);
  const localeReadiness: Record<string, unknown> = {};

  const fileReadinessResults = await mapWithConcurrency(files, 5, async (file) => {
    try {
      const statuses = await input.client.getFileStatusForAllLocales(input.projectId, file.fileUri);
      return mapSmartlingFileLocaleStatusToReadiness(statuses);
    } catch {
      return {} as Record<string, unknown>;
    }
  });

  for (const fileReadiness of fileReadinessResults) {
    for (const [localeId, value] of Object.entries(fileReadiness)) {
      if (input.languageId && localeId !== input.languageId) {
        continue;
      }

      const existing = localeReadiness[localeId];
      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        const record = existing as Record<string, unknown>;
        const next = value as Record<string, unknown>;
        localeReadiness[localeId] = {
          completedStringCount:
            Number(record.completedStringCount ?? 0) + Number(next.completedStringCount ?? 0),
          authorizedStringCount:
            Number(record.authorizedStringCount ?? 0) + Number(next.authorizedStringCount ?? 0),
          lastCompleted: next.lastCompleted ?? record.lastCompleted ?? null,
          lastAuthorized: next.lastAuthorized ?? record.lastAuthorized ?? null,
        };
      } else {
        localeReadiness[localeId] = value;
      }
    }
  }

  return localeReadiness;
}
