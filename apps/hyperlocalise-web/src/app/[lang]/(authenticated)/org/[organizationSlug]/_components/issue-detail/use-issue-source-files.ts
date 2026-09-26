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

export function issueSourceFilesQueryKey(organizationSlug: string, projectId: string) {
  return ["issue-source-files", organizationSlug, projectId] as const;
}

async function loadNativeIssueSourceFiles(organizationSlug: string, projectId: string) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files.$get({
    param: { organizationSlug, projectId },
    query: { limit: "500" },
  });
  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load project files");
  }
  const body = (await response.json()) as {
    files: Array<{ sourcePath: string; filename?: string }>;
  };
  return body.files;
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
    query: { limit: "500" },
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
