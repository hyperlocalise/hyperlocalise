"use client";

import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

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

function catSegmentTargetQueryOptions(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
  enabled?: boolean;
}) {
  return {
    queryKey: projectFileCatSegmentTargetQueryKey(input),
    enabled:
      input.enabled !== false &&
      Boolean(input.externalStringId) &&
      Boolean(input.targetLocale) &&
      Boolean(input.sourcePath),
    staleTime: 30_000,
    queryFn: () => fetchProjectFileCatSegmentTarget(input),
  };
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

  return useQuery(
    catSegmentTargetQueryOptions({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      targetLocale: input.targetLocale,
      externalStringId,
      enabled: input.enabled,
    }),
  );
}

export function useCatSegmentTargets(input: {
  organizationSlug: string;
  projectId: string;
  /** Fallback when a segment does not carry its own sourcePath (single-file CAT). */
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  segments: Array<{
    externalStringId: string;
    sourcePath?: string | null;
    externalResourceId?: string | null;
    resourceType?: "file" | "key" | null;
  }>;
  enabled?: boolean;
}) {
  const segments = useMemo(() => {
    const seen = new Set<string>();
    const unique: typeof input.segments = [];
    for (const segment of input.segments) {
      const id = segment.externalStringId.trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      unique.push(segment);
    }
    return unique;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers memoize input.segments
  }, [input.segments]);

  return useQueries({
    queries: segments.map((segment) =>
      catSegmentTargetQueryOptions({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: segment.sourcePath?.trim() || input.sourcePath,
        externalResourceId: segment.externalResourceId ?? input.externalResourceId,
        resourceType: segment.resourceType ?? input.resourceType,
        targetLocale: input.targetLocale,
        externalStringId: segment.externalStringId,
        enabled: input.enabled,
      }),
    ),
  });
}

export type CatSegmentTargetQueryInput = {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
};

export function useInvalidateCatSegmentTarget() {
  const queryClient = useQueryClient();

  return async (input: CatSegmentTargetQueryInput) => {
    await queryClient.invalidateQueries({
      queryKey: projectFileCatSegmentTargetQueryKey(input),
    });
  };
}

/** Cancel in-flight fetches, seed cache with the saved translation, then refetch. */
export function useSyncCatSegmentTargetAfterSave() {
  const queryClient = useQueryClient();

  return async (input: CatSegmentTargetQueryInput, translation: ProjectFileCatTranslation) => {
    const queryKey = projectFileCatSegmentTargetQueryKey(input);
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, translation);
    await queryClient.invalidateQueries({ queryKey });
  };
}
