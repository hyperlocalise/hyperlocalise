import type {
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueResponse,
} from "@/api/routes/project/project.schema";
import { defaultProjectFileCatPageLimit } from "@/api/routes/project/project.schema";
import type { CatFormatMessageIntl } from "@/components/cat/message-format/cat-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { projectFileCatApiMessages } from "./project-file-cat-api.messages";

export type ProjectFileCatQueuePage = ProjectFileCatQueueResponse["catQueue"];

export function projectFileCatQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  offset: number;
  sourcePaths?: string | null;
}) {
  return [
    "project-file-cat-queue",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.search,
    input.queueFilter,
    input.limit,
    input.offset,
    input.sourcePaths ?? null,
  ] as const;
}

export function projectFileCatBaseQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  sourcePaths?: string | null;
}) {
  return [
    "project-file-cat-queue",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.search,
    input.queueFilter,
    input.limit,
    input.sourcePaths ?? null,
  ] as const;
}

export type ProjectFileCatQueuePageParam = {
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
};

export async function fetchProjectFileCatQueuePage(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
  sourcePaths?: string | null;
  intl: CatFormatMessageIntl;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.queue.$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      sourcePath: input.sourcePath,
      ...(input.externalResourceId ? { externalResourceId: input.externalResourceId } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      ...(input.sourcePaths ? { sourcePaths: input.sourcePaths } : {}),
      targetLocale: input.targetLocale,
      offset: input.offset,
      limit: input.limit,
      ...(input.search ? { search: input.search } : {}),
      ...(input.queueFilter !== "all" ? { queueFilter: input.queueFilter } : {}),
      ...(input.phraseScanPage != null ? { phraseScanPage: input.phraseScanPage } : {}),
      ...(input.phraseScanSkip != null ? { phraseScanSkip: input.phraseScanSkip } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToLoadQueue),
      ),
    );
  }

  const body = (await response.json()) as ProjectFileCatQueueResponse;
  return body.catQueue;
}

/** @deprecated Use fetchProjectFileCatQueuePage — queue panel loads via GET /cat/queue */
export const fetchProjectFileCatPage = fetchProjectFileCatQueuePage;

export const defaultCatPageLimit = defaultProjectFileCatPageLimit;
