"use client";

import { useQuery } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath, type IssueDetailIssue } from "./issue-detail-utils";

export function issueDetailQueryKey(organizationSlug: string, projectId: string, issueId: string) {
  return ["issue-detail", organizationSlug, projectId, issueId] as const;
}

export function useIssueDetailQuery({
  organizationSlug,
  projectId,
  issueId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string | undefined;
  issueId: string | undefined;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: issueDetailQueryKey(organizationSlug, projectId ?? "", issueId ?? ""),
    enabled: enabled && Boolean(projectId && issueId),
    queryFn: async () => {
      const response = await fetch(`${issueSheetApiPath(organizationSlug, projectId!)}/${issueId}`);
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load issue");
      }
      const body = (await response.json()) as { issue: IssueDetailIssue };
      return body.issue;
    },
  });
}
