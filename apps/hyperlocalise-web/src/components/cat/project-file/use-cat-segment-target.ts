"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProjectFileCatTranslation } from "@/api/routes/project/project.schema";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

export function projectFileCatSegmentTargetQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
}) {
  return [
    "project-file-cat-segment-target",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.externalStringId,
  ] as const;
}

export async function fetchProjectFileCatSegmentTarget(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.segments[":externalStringId"].target.$get({
    param: {
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      externalStringId: input.externalStringId,
    },
    query: {
      sourcePath: input.sourcePath,
      ...(input.externalResourceId ? { externalResourceId: input.externalResourceId } : {}),
      ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      targetLocale: input.targetLocale,
    },
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Failed to load segment translation"));
  }

  const body = (await response.json()) as { target: ProjectFileCatTranslation | null };
  return body.target;
}

export function useCatSegmentTarget(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string | null;
  enabled?: boolean;
}) {
  const externalStringId = input.externalStringId ?? "";

  return useQuery({
    queryKey: projectFileCatSegmentTargetQueryKey({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      targetLocale: input.targetLocale,
      externalStringId,
    }),
    enabled:
      input.enabled !== false &&
      Boolean(input.externalStringId) &&
      Boolean(input.targetLocale) &&
      Boolean(input.sourcePath),
    staleTime: 30_000,
    queryFn: () =>
      fetchProjectFileCatSegmentTarget({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: input.externalResourceId,
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        externalStringId,
      }),
  });
}

export function useInvalidateCatSegmentTarget() {
  const queryClient = useQueryClient();

  return async (input: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
    targetLocale: string;
    externalStringId: string;
  }) => {
    await queryClient.invalidateQueries({
      queryKey: projectFileCatSegmentTargetQueryKey(input),
    });
  };
}
