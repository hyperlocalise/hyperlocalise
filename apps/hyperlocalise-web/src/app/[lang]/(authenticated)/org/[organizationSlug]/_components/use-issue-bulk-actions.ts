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

import type { IssueBulkActionBody } from "@/api/routes/issues/issues-bulk.schema";
import { readApiResponseError } from "@/lib/api-error";

import { issueBulkActionBarMessages as messages } from "./issue-bulk-action-bar.messages";

type BulkActionResponse = {
  bulkAction: {
    action: IssueBulkActionBody["action"];
    requested: number;
    succeeded: number;
    failed: number;
    unchanged: number;
    results: Array<{
      issueId: string;
      projectId: string;
      outcome: "updated" | "unchanged" | "failed";
      error?: { code: string; message?: string };
    }>;
  };
};

function organizationBulkActionsPath(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/issues/bulk-actions`;
}

export function useIssueBulkActions({
  organizationSlug,
  onSettled,
}: {
  organizationSlug: string;
  onSettled: (failedIssueIds: string[]) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (body: IssueBulkActionBody) => {
      const response = await fetch(organizationBulkActionsPath(organizationSlug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.bulkFailed));
      }
      return (await response.json()) as BulkActionResponse;
    },
    onSuccess: async (result) => {
      const { bulkAction } = result;
      const failedIssueIds = bulkAction.results
        .filter((row) => row.outcome === "failed")
        .map((row) => row.issueId);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-issues", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["issue-sheet", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["issue-feed", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["issue-detail", organizationSlug] }),
        queryClient.invalidateQueries({ queryKey: ["issue-notifications", organizationSlug] }),
        queryClient.invalidateQueries({
          queryKey: ["issue-notifications-unread-count", organizationSlug],
        }),
      ]);

      const updatedCount = bulkAction.succeeded;
      if (bulkAction.failed === 0 && updatedCount > 0) {
        toast.success(intl.formatMessage(messages.bulkSuccess, { updated: updatedCount }));
      } else if (bulkAction.failed > 0 && updatedCount > 0) {
        toast.message(
          intl.formatMessage(messages.bulkPartial, {
            updated: updatedCount,
            requested: bulkAction.requested,
            failed: bulkAction.failed,
          }),
        );
      } else if (bulkAction.failed > 0 && updatedCount === 0) {
        toast.error(intl.formatMessage(messages.bulkFailed));
      }

      onSettled(failedIssueIds);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.bulkFailed));
    },
  });

  const runBulkAction = (body: IssueBulkActionBody) => {
    mutation.mutate(body);
  };

  return {
    runBulkAction,
    isPending: mutation.isPending,
  };
}
