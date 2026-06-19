import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";
import { defaultProjectFileCatPageLimit } from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export type ProjectFileCatPage = ProjectFileCatResponse["catFile"];

export function projectFileCatQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  repositoryFullName: string | null;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  offset: number;
}) {
  return [
    "project-file-cat",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
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
  targetLocale: string;
  repositoryFullName: string | null;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
}) {
  return [
    "project-file-cat",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.targetLocale,
    input.repositoryFullName,
    input.search,
    input.queueFilter,
    input.limit,
  ] as const;
}

export async function fetchProjectFileCatPage(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  repositoryFullName: string | null;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  limit: number;
  offset: number;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      offset: input.offset,
      limit: input.limit,
      ...(input.search ? { search: input.search } : {}),
      ...(input.queueFilter !== "all" ? { queueFilter: input.queueFilter } : {}),
      ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load CAT workspace"));
  }

  const body = (await response.json()) as ProjectFileCatResponse;
  return body.catFile;
}

export const defaultCatPageLimit = defaultProjectFileCatPageLimit;
