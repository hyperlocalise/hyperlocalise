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
  ProjectFileCatQueueFilter,
  ProjectFileCatQueueResponse,
  ProjectFileCatQueueSort,
} from "@/api/routes/project/project.schema";
import { defaultProjectFileCatPageLimit } from "@/api/routes/project/project.schema";
import type { CatFormatMessageIntl } from "@/components/cat/message-format/cat-message-format-i18n";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { projectFileCatApiMessages } from "./project-file-cat-api.messages";

export type ProjectFileCatQueuePage = ProjectFileCatQueueResponse["catQueue"];

export function projectFileCatQueryKey(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  queueSort: ProjectFileCatQueueSort;
  limit: number;
  offset: number;
  sourcePaths?: string | null;
}) {
  return [
    "project-file-cat-queue",
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
  queueFilter: ProjectFileCatQueueFilter;
  queueSort: ProjectFileCatQueueSort;
  limit: number;
  sourcePaths?: string | null;
}) {
  return [
    "project-file-cat-queue",
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

function catQueuePlaceholderIdentity(key: readonly unknown[]) {
  if (key.length !== CAT_QUEUE_BASE_QUERY_KEY_LENGTH || key[0] !== "project-file-cat-queue") {
    return null;
  }

  return [key[0], key[1], key[2], key[3], key[4], key[5], key[6], key[11]] as const;
}

export function canReuseCatQueuePlaceholderData(
  previousKey: readonly unknown[],
  nextKey: readonly unknown[],
) {
  const previousIdentity = catQueuePlaceholderIdentity(previousKey);
  const nextIdentity = catQueuePlaceholderIdentity(nextKey);
  if (!previousIdentity || !nextIdentity) {
    return false;
  }

  return previousIdentity.every((value, index) => Object.is(value, nextIdentity[index]));
}

export type ProjectFileCatQueuePageParam = {
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
  sortBucket?: number;
  sortBucketOffset?: number;
};

export async function fetchProjectFileCatQueuePage(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  targetLocale: string;
  search: string;
  queueFilter: ProjectFileCatQueueFilter;
  queueSort: ProjectFileCatQueueSort;
  limit: number;
  offset: number;
  phraseScanPage?: number;
  phraseScanSkip?: number;
  sortBucket?: number;
  sortBucketOffset?: number;
  sourcePaths?: string | null;
  intl: CatFormatMessageIntl;
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

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        input.intl.formatMessage(projectFileCatApiMessages.failedToLoadQueue),
      ),
    );
  }

  const body = (await response.json()) as ProjectFileCatQueueResponse;
  return body.catQueue;
}

/** @deprecated Use fetchProjectFileCatQueuePage — queue panel loads via GET /cat/queue */
export const fetchProjectFileCatPage = fetchProjectFileCatQueuePage;

export const defaultCatPageLimit = defaultProjectFileCatPageLimit;
