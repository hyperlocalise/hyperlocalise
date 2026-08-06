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

import { readApiResponseError } from "@/lib/api-error";

import { issueWatchControlMessages as messages } from "./issue-watch-control.messages";
import { issueSheetApiPath, type IssueDetailIssue } from "./issue-detail-utils";
import { issueDetailQueryKey } from "./use-issue-detail-query";

export function useIssueSubscriptionMutations({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const detailKey = issueDetailQueryKey(organizationSlug, projectId, issueId);
  const basePath = `${issueSheetApiPath(organizationSlug, projectId)}/${issueId}/subscription`;

  const setWatching = (isWatching: boolean) => {
    queryClient.setQueryData<IssueDetailIssue>(detailKey, (current) =>
      current ? { ...current, isWatching } : current,
    );
  };

  const watch = useMutation({
    mutationFn: async () => {
      const response = await fetch(basePath, { method: "POST" });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to watch issue");
      }
    },
    onMutate: () => {
      setWatching(true);
    },
    onError: () => {
      setWatching(false);
      toast.error(intl.formatMessage(messages.watchError));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
  });

  const unwatch = useMutation({
    mutationFn: async () => {
      const response = await fetch(basePath, { method: "DELETE" });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to unwatch issue");
      }
    },
    onMutate: () => {
      setWatching(false);
    },
    onError: () => {
      setWatching(true);
      toast.error(intl.formatMessage(messages.watchError));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
    },
  });

  return {
    watch,
    unwatch,
    isPending: watch.isPending || unwatch.isPending,
  };
}
