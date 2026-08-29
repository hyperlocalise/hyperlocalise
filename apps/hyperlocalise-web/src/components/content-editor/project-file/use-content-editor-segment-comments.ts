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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { projectFileCatApiMessages } from "./project-file-content-editor-api.messages";

export function projectFileCatSegmentCommentsQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
}) {
  return [
    "project-file-content-editor-segment-comments",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.externalStringId,
  ] as const;
}

export async function fetchProjectFileContentEditorSegmentComments(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string;
  intl: ContentEditorFormatMessageIntl;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.segments[":externalStringId"].comments.$get({
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

  if (response.status !== 200) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToLoadSegmentComments),
      ),
    );
  }

  const body = await response.json();
  return body.comments;
}

export function useContentEditorSegmentComments(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  externalStringId: string | null;
  enabled?: boolean;
}) {
  const intl = useIntl();
  const externalStringId = input.externalStringId ?? "";

  return useQuery({
    queryKey: projectFileCatSegmentCommentsQueryKey({
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
      fetchProjectFileContentEditorSegmentComments({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        externalResourceId: input.externalResourceId,
        resourceType: input.resourceType,
        targetLocale: input.targetLocale,
        externalStringId,
        intl,
      }),
  });
}

export function useInvalidateCatSegmentComments() {
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
      queryKey: projectFileCatSegmentCommentsQueryKey(input),
    });
  };
}
