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
import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import type {
  ProjectFileCatComment,
  ProjectFileCatGroupOccurrence,
  ProjectFileCatGroupOccurrencesResponse,
  ProjectFileCatTranslation,
} from "@/api/routes/project/project.schema";
import type { CatFormatMessageIntl } from "@/components/cat/message-format/cat-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { projectFileCatApiMessages } from "./project-file-cat-api.messages";

export function projectFileCatGroupOccurrencesQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  targetLocale: string;
  groupId: string;
  sourceTextHash: string;
}) {
  return [
    "project-file-cat-group-occurrences",
    input.organizationSlug,
    input.projectId,
    input.targetLocale,
    input.groupId,
    input.sourceTextHash,
  ] as const;
}

export async function fetchProjectFileCatGroupOccurrences(input: {
  organizationSlug: string;
  projectId: string;
  targetLocale: string;
  groupId: string;
  sourceTextHash: string;
  intl: CatFormatMessageIntl;
}): Promise<ProjectFileCatGroupOccurrence[]> {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat.groups[":groupId"].occurrences.$get({
    param: {
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      groupId: input.groupId,
    },
    query: {
      targetLocale: input.targetLocale,
      sourceTextHash: input.sourceTextHash,
    },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToLoadGroupOccurrences),
      ),
    );
  }

  const body = (await response.json()) as ProjectFileCatGroupOccurrencesResponse;
  return body.groupOccurrences.occurrences;
}

export function representativeTargetFromOccurrences(
  occurrences: readonly ProjectFileCatGroupOccurrence[],
): ProjectFileCatTranslation | null {
  return occurrences.find((occurrence) => occurrence.target)?.target ?? null;
}

export function flattenGroupOccurrenceComments(
  occurrences: readonly ProjectFileCatGroupOccurrence[],
): ProjectFileCatComment[] {
  return occurrences.flatMap((occurrence) => occurrence.comments);
}

export function useCatGroupOccurrences(input: {
  organizationSlug: string;
  projectId: string;
  targetLocale: string;
  groupId: string | null;
  sourceTextHash: string | null;
  enabled?: boolean;
}) {
  const intl = useIntl();
  const groupId = input.groupId ?? "";
  const sourceTextHash = input.sourceTextHash ?? "";

  return useQuery({
    queryKey: projectFileCatGroupOccurrencesQueryKey({
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      targetLocale: input.targetLocale,
      groupId,
      sourceTextHash,
    }),
    enabled:
      input.enabled !== false &&
      Boolean(groupId) &&
      Boolean(sourceTextHash) &&
      Boolean(input.targetLocale),
    staleTime: 30_000,
    queryFn: () =>
      fetchProjectFileCatGroupOccurrences({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        targetLocale: input.targetLocale,
        groupId,
        sourceTextHash,
        intl,
      }),
  });
}

export function useCatGroupOccurrencesList(input: {
  organizationSlug: string;
  projectId: string;
  targetLocale: string;
  groups: Array<{ groupId: string; sourceTextHash: string }>;
  enabled?: boolean;
}) {
  const intl = useIntl();
  const groups = useMemo(() => {
    const seen = new Set<string>();
    const unique: typeof input.groups = [];
    for (const group of input.groups) {
      const id = group.groupId.trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      unique.push(group);
    }
    return unique;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers memoize input.groups
  }, [input.groups]);

  return useQueries({
    queries: groups.map((group) => ({
      queryKey: projectFileCatGroupOccurrencesQueryKey({
        organizationSlug: input.organizationSlug,
        projectId: input.projectId,
        targetLocale: input.targetLocale,
        groupId: group.groupId,
        sourceTextHash: group.sourceTextHash,
      }),
      enabled:
        input.enabled !== false &&
        Boolean(group.groupId) &&
        Boolean(group.sourceTextHash) &&
        Boolean(input.targetLocale),
      staleTime: 30_000,
      queryFn: () =>
        fetchProjectFileCatGroupOccurrences({
          organizationSlug: input.organizationSlug,
          projectId: input.projectId,
          targetLocale: input.targetLocale,
          groupId: group.groupId,
          sourceTextHash: group.sourceTextHash,
          intl,
        }),
    })),
  });
}

export function useInvalidateCatGroupOccurrences() {
  const queryClient = useQueryClient();

  return async (input: {
    organizationSlug: string;
    projectId: string;
    targetLocale: string;
    groupId: string;
    sourceTextHash: string;
  }) => {
    await queryClient.invalidateQueries({
      queryKey: projectFileCatGroupOccurrencesQueryKey(input),
    });
  };
}
