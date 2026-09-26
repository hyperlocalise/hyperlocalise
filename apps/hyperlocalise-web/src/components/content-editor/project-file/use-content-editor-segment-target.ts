"use client";

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
import { createContentEditorRequestScheduler } from "@/components/content-editor/shared/content-editor-request-scheduler";
import { useNativeTargetLoader } from "./content-editor-native-target-context";
import { CAT_CACHE_GC_TIME, installEditorCacheBudget } from "./content-editor-cache-budget";
import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import type { ProjectFileContentEditorTranslation } from "@/api/routes/project/project.schema";
import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { goSvcErrorMessage, isCatDeferredToApp } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { projectFileCatApiMessages } from "./project-file-content-editor-api.messages";

const scheduleTargetRequest = createContentEditorRequestScheduler(4);

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
    "project-file-content-editor-segment-target",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.externalStringId,
  ] as const;
}

export async function fetchProjectFileContentEditorSegmentTarget(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
  intl: ContentEditorFormatMessageIntl;
  signal?: AbortSignal;
  goSvcClient?: GoSvcClient;
}) {
  if (input.goSvcClient && !input.externalResourceId) {
    try {
      const { target } = await input.goSvcClient.cat.segmentTarget(
        input.organizationSlug,
        input.projectId,
        input.externalStringId,
        {
          sourcePath: input.sourcePath,
          targetLocale: input.targetLocale,
          ...(input.resourceType ? { resourceType: input.resourceType } : {}),
        },
        { signal: input.signal },
      );
      return target;
    } catch (error) {
      if (!isCatDeferredToApp(error)) {
        throw new Error(
          goSvcErrorMessage(
            error,
            input.intl.formatMessage(projectFileCatApiMessages.failedToLoadSegmentTranslation),
          ),
        );
      }
    }
  }

  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.segments[":externalStringId"].target.$get(
    {
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
    },
    { init: { signal: input.signal } },
  );

  if (response.status !== 200) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToLoadSegmentTranslation),
      ),
    );
  }

  const body = await response.json();
  return body.target;
}

function contentEditorSegmentTargetQueryOptions(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
  enabled?: boolean;
  priority?: boolean;
  intl: ContentEditorFormatMessageIntl;
  nativeLoader?: ReturnType<typeof useNativeTargetLoader>;
  goSvcClient?: GoSvcClient;
}) {
  return {
    queryKey: projectFileCatSegmentTargetQueryKey(input),
    enabled:
      input.enabled !== false &&
      Boolean(input.externalStringId) &&
      Boolean(input.targetLocale) &&
      Boolean(input.sourcePath),
    staleTime: 30_000,
    gcTime: CAT_CACHE_GC_TIME,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      input.nativeLoader
        ? input.nativeLoader(input, signal, input.priority)
        : scheduleTargetRequest(
            () =>
              fetchProjectFileContentEditorSegmentTarget({
                ...input,
                signal,
                goSvcClient: input.goSvcClient,
              }),
            signal,
            input.priority,
          ),
  };
}

export function useContentEditorSegmentTarget(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string | null;
  enabled?: boolean;
  priority?: boolean;
}) {
  const intl = useIntl();
  const { client: goSvcClient } = useGoSvcClient();
  const nativeLoader = useNativeTargetLoader();
  installEditorCacheBudget(useQueryClient());
  const externalStringId = input.externalStringId ?? "";

  return useQuery(
    contentEditorSegmentTargetQueryOptions({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      externalResourceId: input.externalResourceId,
      resourceType: input.resourceType,
      targetLocale: input.targetLocale,
      externalStringId,
      enabled: input.enabled,
      priority: input.priority ?? true,
      intl,
      nativeLoader,
      goSvcClient,
    }),
  );
}

export function useContentEditorSegmentTargets(input: {
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
  const intl = useIntl();
  const { client: goSvcClient } = useGoSvcClient();
  const nativeLoader = useNativeTargetLoader();
  installEditorCacheBudget(useQueryClient());
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
      contentEditorSegmentTargetQueryOptions({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: segment.sourcePath?.trim() || input.sourcePath,
        externalResourceId: segment.externalResourceId ?? input.externalResourceId,
        resourceType: segment.resourceType ?? input.resourceType,
        targetLocale: input.targetLocale,
        externalStringId: segment.externalStringId,
        enabled: input.enabled,
        intl,
        nativeLoader,
        goSvcClient,
      }),
    ),
  });
}

export type ContentEditorSegmentTargetQueryInput = {
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

  return async (input: ContentEditorSegmentTargetQueryInput) => {
    await queryClient.invalidateQueries({
      queryKey: projectFileCatSegmentTargetQueryKey(input),
    });
  };
}

/** The write response is authoritative; cancel older reads and publish it immediately. */
export function useSyncCatSegmentTargetAfterSave() {
  const queryClient = useQueryClient();

  return async (
    input: ContentEditorSegmentTargetQueryInput,
    translation: ProjectFileContentEditorTranslation,
  ) => {
    const queryKey = projectFileCatSegmentTargetQueryKey(input);
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, translation);
  };
}
