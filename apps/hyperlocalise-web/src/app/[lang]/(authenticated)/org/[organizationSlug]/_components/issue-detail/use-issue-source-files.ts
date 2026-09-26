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
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

export type IssueSourceFile = {
  sourcePath: string;
  filename: string;
};

export const ISSUE_SOURCE_FILES_PAGE_SIZE = 500;
export const ISSUE_SOURCE_FILES_MAX_PAGES = 20;
export const ISSUE_SOURCE_PROVIDER_FILES_LIMIT = 1_000;

export function issueSourceFilesQueryKey(organizationSlug: string, projectId: string) {
  return ["issue-source-files", organizationSlug, projectId] as const;
}

export async function collectIssueSourceFilePages(
  fetchPage: (
    offset: number,
    limit: number,
  ) => Promise<Array<{ sourcePath: string; filename?: string }>>,
  pageSize = ISSUE_SOURCE_FILES_PAGE_SIZE,
  maxPages = ISSUE_SOURCE_FILES_MAX_PAGES,
) {
  const files: Array<{ sourcePath: string; filename?: string }> = [];
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await fetchPage(page * pageSize, pageSize);
    files.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }
  return files;
}

async function loadNativeIssueSourceFilePage(
  organizationSlug: string,
  projectId: string,
  offset: number,
  limit: number,
) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files.$get({
    param: { organizationSlug, projectId },
    query: { limit: String(limit), offset },
  });
  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load project files");
  }
  const body = (await response.json()) as {
    files: Array<{ sourcePath: string; filename?: string }>;
  };
  return body.files;
}

async function loadNativeIssueSourceFiles(organizationSlug: string, projectId: string) {
  return collectIssueSourceFilePages((offset, limit) =>
    loadNativeIssueSourceFilePage(organizationSlug, projectId, offset, limit),
  );
}

async function loadProviderIssueSourceFiles(organizationSlug: string, projectId: string) {
  const encoded = parseProviderProjectId(projectId);
  if (!encoded) {
    return [];
  }

  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
    ":externalProjectId"
  ].files.$get({
    param: {
      organizationSlug,
      externalProjectId: encoded.externalProjectId,
    },
    query: { limit: String(ISSUE_SOURCE_PROVIDER_FILES_LIMIT) },
  });
  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load project files");
  }
  const body = (await response.json()) as {
    files: Array<{ sourcePath: string; filename?: string }>;
  };
  return body.files;
}

export function useIssueSourceFilesQuery({
  organizationSlug,
  projectId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: issueSourceFilesQueryKey(organizationSlug, projectId),
    enabled: Boolean(organizationSlug && projectId && enabled),
    queryFn: async (): Promise<IssueSourceFile[]> => {
      const files = parseProviderProjectId(projectId)
        ? await loadProviderIssueSourceFiles(organizationSlug, projectId)
        : await loadNativeIssueSourceFiles(organizationSlug, projectId);

      return files.map((file) => ({
        sourcePath: file.sourcePath,
        filename: file.filename ?? file.sourcePath,
      }));
    },
  });
}
