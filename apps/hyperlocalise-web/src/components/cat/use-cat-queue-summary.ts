"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { ProjectFileCatQueueSummary } from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export function projectFileCatQueueSummaryQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  repositoryFullName: string | null;
}) {
  return [
    "project-file-cat-queue-summary",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.targetLocale,
    input.repositoryFullName,
  ] as const;
}

export async function fetchProjectFileCatQueueSummary(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  repositoryFullName: string | null;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.queue.summary.$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load queue summary"));
  }

  const body = (await response.json()) as { queueSummary: ProjectFileCatQueueSummary };
  return body.queueSummary;
}

export function useCatQueueSummary(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  repositoryFullName?: string | null;
  enabled?: boolean;
}) {
  const repositoryFullName = input.repositoryFullName ?? null;

  return useQuery({
    queryKey: projectFileCatQueueSummaryQueryKey({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      repositoryFullName,
    }),
    enabled: input.enabled !== false && Boolean(input.targetLocale) && Boolean(input.sourcePath),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchProjectFileCatQueueSummary({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        repositoryFullName,
      }),
  });
}

export function useInvalidateCatQueueSummary() {
  const queryClient = useQueryClient();

  return useCallback(
    async (input: {
      organizationSlug: string;
      projectId: string;
      sourcePath: string;
      targetLocale: string;
      repositoryFullName?: string | null;
    }) => {
      await queryClient.invalidateQueries({
        queryKey: projectFileCatQueueSummaryQueryKey({
          ...input,
          repositoryFullName: input.repositoryFullName ?? null,
        }),
      });
    },
    [queryClient],
  );
}
