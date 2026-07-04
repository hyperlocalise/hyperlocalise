import type {
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueResponse,
} from "@/api/routes/project/project.schema";
import { defaultProjectFileCatPageLimit } from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export type ProjectFileCatQueuePage = ProjectFileCatQueueResponse["catQueue"];

export function projectFileCatQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  repositoryFullName: string | null;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  offset: number;
}) {
  return [
    "project-file-cat-queue",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.repositoryFullName,
    input.search,
    input.queueFilter,
    input.limit,
    input.offset,
  ] as const;
}

export function projectFileCatBaseQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  repositoryFullName: string | null;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
}) {
  return [
    "project-file-cat-queue",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.repositoryFullName,
    input.search,
    input.queueFilter,
    input.limit,
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
  repositoryFullName: string | null;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.queue.$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      sourcePath: input.sourcePath,
      ...(input.externalResourceId ? { externalResourceId: input.externalResourceId } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      targetLocale: input.targetLocale,
      offset: input.offset,
      limit: input.limit,
      ...(input.search ? { search: input.search } : {}),
      ...(input.queueFilter !== "all" ? { queueFilter: input.queueFilter } : {}),
      ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
      ...(input.phraseScanPage != null ? { phraseScanPage: input.phraseScanPage } : {}),
      ...(input.phraseScanSkip != null ? { phraseScanSkip: input.phraseScanSkip } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load CAT queue"));
  }

  const body = (await response.json()) as ProjectFileCatQueueResponse;
  return body.catQueue;
}

/** @deprecated Use fetchProjectFileCatQueuePage — queue panel loads via GET /cat/queue */
export const fetchProjectFileCatPage = fetchProjectFileCatQueuePage;

export const defaultCatPageLimit = defaultProjectFileCatPageLimit;
