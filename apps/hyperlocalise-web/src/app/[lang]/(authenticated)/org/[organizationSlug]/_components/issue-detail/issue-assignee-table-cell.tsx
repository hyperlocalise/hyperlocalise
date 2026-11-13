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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { IssueAssigneePicker } from "./issue-assignee-picker";
import { issueDetailPanelMessages } from "./issue-detail-panel.messages";
import { isIssueDetailIssue } from "./issue-detail-utils";
import {
  patchIssueSheetListCacheForAssignee,
  patchOrganizationIssueListCaches,
} from "./patch-organization-issue-list-caches";
import { issueFeedQueryKey } from "./use-issue-feed";
import { useAssignableIssueMembersQuery } from "./use-assignable-issue-members";

export function IssueAssigneeTableCell({
  organizationSlug,
  projectId,
  issueId,
  assigneeUserId,
  assigneeLabel,
  disabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const membersQuery = useAssignableIssueMembersQuery({
    organizationSlug,
    projectId,
  });
  const actorUserId = membersQuery.data?.members.find((member) => member.isCurrentUser)?.userId;

  const updateAssignee = useMutation({
    mutationFn: async (nextAssigneeUserId: string | null) => {
      const failed = intl.formatMessage(issueDetailPanelMessages.updateFailed);
      try {
        const body = await goSvcClient.issueSheet.update(organizationSlug, projectId, issueId, {
          assigneeUserId: nextAssigneeUserId,
        });
        if (!isIssueDetailIssue(body.issue)) {
          throw new Error(failed);
        }
        return { issue: body.issue };
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, failed), { cause: error });
      }
    },
    onSuccess: async (result) => {
      if (actorUserId) {
        patchOrganizationIssueListCaches(queryClient, {
          organizationSlug,
          issueId,
          assigneeUserId: result.issue.assigneeUserId,
          assignee: result.issue.assignee,
          actorUserId,
        });
      }

      patchIssueSheetListCacheForAssignee(queryClient, {
        organizationSlug,
        projectId,
        issueId,
        assigneeUserId: result.issue.assigneeUserId,
        assignee: result.issue.assignee,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["issue-sheet", organizationSlug, projectId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-issues", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: issueFeedQueryKey(organizationSlug, projectId, issueId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(issueDetailPanelMessages.updateFailed),
      );
    },
  });

  return (
    <IssueAssigneePicker
      value={assigneeUserId}
      currentLabel={assigneeLabel}
      members={membersQuery.data?.members ?? []}
      isLoading={membersQuery.isLoading}
      disabled={disabled || updateAssignee.isPending}
      size="sm"
      onChange={(next) => {
        updateAssignee.mutate(next);
      }}
    />
  );
}
