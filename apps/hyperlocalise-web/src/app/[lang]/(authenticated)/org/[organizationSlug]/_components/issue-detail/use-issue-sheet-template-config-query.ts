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
import { useQuery } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath } from "./issue-detail-utils";

export type IssueSheetTemplateAssigneeBinding = {
  templateKey: string;
  userId: string;
  // False when the bound user is no longer an active, assignable member of this project — the
  // binding still exists in the stored config (so an admin can see and fix it), it just should
  // not be prefilled onto a new issue.
  assignable: boolean;
};

export type IssueSheetTemplateConfig = {
  defaultTemplateKey: string | null;
  assigneeByTemplate: IssueSheetTemplateAssigneeBinding[];
};

export function issueSheetTemplateConfigQueryKey(organizationSlug: string, projectId: string) {
  return ["issue-sheet-template-config", organizationSlug, projectId] as const;
}

export function useIssueSheetTemplateConfigQuery({
  organizationSlug,
  projectId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string | undefined;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: issueSheetTemplateConfigQueryKey(organizationSlug, projectId ?? ""),
    enabled: Boolean(organizationSlug && projectId && enabled),
    queryFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId!)}/template-config`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load issue template config");
      }
      const body = (await response.json()) as { templateConfig: IssueSheetTemplateConfig };
      return body.templateConfig;
    },
  });
}
