import type { ProjectFileCatQueueSummary } from "@/api/routes/project/project.schema";
import type { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { buildCrowdinFileQueueCroql } from "@/lib/providers/adapters/crowdin/crowdin-croql";
import { maxCrowdinSourceStringCountCeiling } from "@/api/routes/project/project.schema";

import type { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

export async function countNativeFileQueueSummary(
  translations: ProjectTranslationService,
  input: {
    organizationId: string;
    projectId: string;
    repositorySourceFileId: string;
    targetLocale: string;
  },
): Promise<ProjectFileCatQueueSummary> {
  const base = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: input.repositorySourceFileId,
    targetLocale: input.targetLocale,
  };

  const [total, reviewed, untranslated, needsReview, hasIssues] = await Promise.all([
    translations.countKeysForFile(base),
    translations.countKeysForFile({ ...base, queueFilter: "reviewed" }),
    translations.countKeysForFile({ ...base, queueFilter: "untranslated" }),
    translations.countKeysForFile({ ...base, queueFilter: "needs_review" }),
    translations.countKeysForFile({ ...base, queueFilter: "has_issues" }),
  ]);

  return {
    total,
    reviewed,
    untranslated,
    needsReview,
    hasIssues,
  };
}

async function countCrowdinSourceStrings(
  client: CrowdinApiClient,
  projectId: number,
  filter: { fileId?: number; croql?: string },
  options?: { maxCount?: number },
) {
  const ceiling = options?.maxCount ?? maxCrowdinSourceStringCountCeiling;
  let total = 0;
  let offset = 0;

  while (total < ceiling) {
    const page = await client.listSourceStringsPage(projectId, {
      fileId: filter.fileId,
      croql: filter.croql,
      offset,
      limit: 500,
    });
    total += page.strings.length;
    if (!page.hasMore) {
      return total;
    }
    if (page.strings.length === 0) {
      return total;
    }
    if (total >= ceiling) {
      return ceiling;
    }
    offset += page.strings.length;
  }

  return Math.min(total, ceiling);
}

export async function countCrowdinFileQueueSummary(
  client: CrowdinApiClient,
  projectId: number,
  fileId: number,
  targetLocale: string,
  options?: { knownTotal?: number },
): Promise<ProjectFileCatQueueSummary> {
  const totalPromise =
    options?.knownTotal != null
      ? Promise.resolve(options.knownTotal)
      : countCrowdinSourceStrings(client, projectId, { fileId });

  const [total, reviewed, untranslated, needsReview, hasIssues] = await Promise.all([
    totalPromise,
    countCrowdinSourceStrings(client, projectId, {
      croql: buildCrowdinFileQueueCroql({ fileId, targetLocale, queueFilter: "reviewed" }),
    }),
    countCrowdinSourceStrings(client, projectId, {
      croql: buildCrowdinFileQueueCroql({ fileId, targetLocale, queueFilter: "untranslated" }),
    }),
    countCrowdinSourceStrings(client, projectId, {
      croql: buildCrowdinFileQueueCroql({ fileId, targetLocale, queueFilter: "needs_review" }),
    }),
    countCrowdinSourceStrings(client, projectId, {
      croql: buildCrowdinFileQueueCroql({ fileId, targetLocale, queueFilter: "has_issues" }),
    }),
  ]);

  return {
    total,
    reviewed,
    untranslated,
    needsReview,
    hasIssues,
  };
}
