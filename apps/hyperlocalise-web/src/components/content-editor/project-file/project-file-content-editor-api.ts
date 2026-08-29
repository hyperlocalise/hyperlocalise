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
import type {
  ProjectFileContentEditorQueueFilter,
  ProjectFileContentEditorQueueResponse,
  ProjectFileContentEditorQueueSort,
} from "@/api/routes/project/project.schema";
import { defaultProjectFileContentEditorPageLimit } from "@/api/routes/project/project.schema";
import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { projectFileCatApiMessages } from "./project-file-content-editor-api.messages";

export type ProjectFileContentEditorQueuePage =
  ProjectFileContentEditorQueueResponse["contentEditorQueue"];

export function projectFileCatQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileContentEditorQueueFilter;
  queueSort: ProjectFileContentEditorQueueSort;
  limit: number;
  offset: number;
  sourcePaths?: string | null;
}) {
  return [
    "project-file-content-editor-queue",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.search,
    input.queueFilter,
    input.queueSort,
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
  queueFilter: ProjectFileContentEditorQueueFilter;
  queueSort: ProjectFileContentEditorQueueSort;
  limit: number;
  sourcePaths?: string | null;
}) {
  return [
    "project-file-content-editor-queue",
    input.organizationSlug,
    input.projectId,
    input.sourcePath,
    input.externalResourceId ?? null,
    input.resourceType ?? null,
    input.targetLocale,
    input.search,
    input.queueFilter,
    input.queueSort,
    input.limit,
    input.sourcePaths ?? null,
  ] as const;
}

const CAT_QUEUE_BASE_QUERY_KEY_LENGTH = 12;

function contentEditorQueuePlaceholderIdentity(key: readonly unknown[]) {
  if (
    key.length !== CAT_QUEUE_BASE_QUERY_KEY_LENGTH ||
    key[0] !== "project-file-content-editor-queue"
  ) {
    return null;
  }

  return [key[0], key[1], key[2], key[3], key[4], key[5], key[6], key[11]] as const;
}

/**
 * Placeholder reuse keeps the CAT chrome mounted when search / filter / sort /
 * page size change. Callers must not treat placeholder or not-yet-ingested
 * segments as bulk-action targets (see ContentEditorQueueToolbar `isQueueLoading`).
 */
export function canReuseCatQueuePlaceholderData(
  previousKey: readonly unknown[],
  nextKey: readonly unknown[],
) {
  const previousIdentity = contentEditorQueuePlaceholderIdentity(previousKey);
  const nextIdentity = contentEditorQueuePlaceholderIdentity(nextKey);
  if (!previousIdentity || !nextIdentity) {
    return false;
  }

  return previousIdentity.every((value, index) => Object.is(value, nextIdentity[index]));
}

export type ProjectFileContentEditorQueuePageParam = {
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
  sortBucket?: number;
  sortBucketOffset?: number;
};

export async function fetchProjectFileContentEditorQueuePage(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileContentEditorQueueFilter;
  queueSort: ProjectFileContentEditorQueueSort;
  limit: number;
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
  sortBucket?: number;
  sortBucketOffset?: number;
  sourcePaths?: string | null;
  intl: ContentEditorFormatMessageIntl;
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
      ...(input.queueSort !== "file_order" ? { queueSort: input.queueSort } : {}),
      ...(input.phraseScanPage != null ? { phraseScanPage: input.phraseScanPage } : {}),
      ...(input.phraseScanSkip != null ? { phraseScanSkip: input.phraseScanSkip } : {}),
      ...(input.sortBucket != null ? { sortBucket: input.sortBucket } : {}),
      ...(input.sortBucketOffset != null ? { sortBucketOffset: input.sortBucketOffset } : {}),
    },
  });

  if (response.status !== 200) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToLoadQueue),
      ),
    );
  }

  const body = await response.json();
  return body.contentEditorQueue;
}

/** @deprecated Use fetchProjectFileContentEditorQueuePage — queue panel loads via GET /cat/queue */
export const fetchProjectFileContentEditorPage = fetchProjectFileContentEditorQueuePage;

export const defaultCatPageLimit = defaultProjectFileContentEditorPageLimit;
