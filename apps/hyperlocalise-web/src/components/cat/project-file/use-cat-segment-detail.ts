"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProjectFileCatSegment } from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export function projectFileCatSegmentDetailQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalStringId: string;
  repositoryFullName: string | null;
}) {
  return [
    "project-file-cat-segment-detail",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.targetLocale,
    input.externalStringId,
    input.repositoryFullName,
  ] as const;
}

export async function fetchProjectFileCatSegmentDetail(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalStringId: string;
  repositoryFullName: string | null;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.segments[":externalStringId"].$get({
    param: {
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      externalStringId: input.externalStringId,
    },
    query: {
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load segment details"));
  }

  const body = (await response.json()) as { segment: ProjectFileCatSegment };
  return body.segment;
}

export function useCatSegmentDetail(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  externalStringId: string | null;
  repositoryFullName?: string | null;
  enabled?: boolean;
}) {
  const repositoryFullName = input.repositoryFullName ?? null;
  const externalStringId = input.externalStringId ?? "";

  return useQuery({
    queryKey: projectFileCatSegmentDetailQueryKey({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      externalStringId,
      repositoryFullName,
    }),
    enabled:
      input.enabled !== false &&
      Boolean(input.externalStringId) &&
      Boolean(input.targetLocale) &&
      Boolean(input.sourcePath),
    staleTime: 30_000,
    queryFn: () =>
      fetchProjectFileCatSegmentDetail({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: input.targetLocale,
        externalStringId,
        repositoryFullName,
      }),
  });
}

export function useInvalidateCatSegmentDetail() {
  const queryClient = useQueryClient();

  return async (input: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalStringId: string;
    repositoryFullName?: string | null;
  }) => {
    await queryClient.invalidateQueries({
      queryKey: projectFileCatSegmentDetailQueryKey({
        ...input,
        repositoryFullName: input.repositoryFullName ?? null,
      }),
    });
  };
}
