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
import { useRef } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import { type IssueDetailIssue, isIssueDetailIssue } from "./issue-detail-utils";
import {
  patchIssueSheetListCacheForAssignee,
  patchOrganizationIssueListCaches,
} from "./patch-organization-issue-list-caches";
import { issueDetailQueryKey } from "./use-issue-detail-query";
import { issueFeedQueryKey } from "./use-issue-feed";

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function trackAbortController(controllers: Set<AbortController>, controller: AbortController) {
  controllers.add(controller);
  controller.signal.addEventListener(
    "abort",
    () => {
      controllers.delete(controller);
    },
    { once: true },
  );
}

function releaseAbortController(controllers: Set<AbortController>, controller: AbortController) {
  controllers.delete(controller);
}

/** Merge only the PATCH body into cache so a slower concurrent response cannot revert other fields. */
function mergeIssuePatch(
  current: IssueDetailIssue | undefined,
  patch: Record<string, unknown>,
  fallback: IssueDetailIssue,
): IssueDetailIssue {
  if (!current) {
    return fallback;
  }
  const mergedEntries = Object.entries(patch).filter(([key]) => Object.hasOwn(current, key));
  return {
    ...current,
    ...Object.fromEntries(mergedEntries),
  };
}

export function useIssueDetailMutations({
  organizationSlug,
  projectId,
  issueId,
  actorUserId,
  onSaved,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  actorUserId?: string;
  onSaved?: () => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const requestFailed = intl.formatMessage(messages.updateFailed);
  const updateAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const setValueAbortControllersRef = useRef<Set<AbortController>>(new Set());

  const invalidate = async (body?: Record<string, unknown>) => {
    const tasks = [
      queryClient.invalidateQueries({
        queryKey: issueDetailQueryKey(organizationSlug, projectId, issueId),
      }),
      queryClient.invalidateQueries({ queryKey: ["issue-sheet", organizationSlug, projectId] }),
      queryClient.invalidateQueries({ queryKey: ["organization-issues", organizationSlug] }),
    ];
    if (body && (Object.hasOwn(body, "assigneeUserId") || Object.hasOwn(body, "status"))) {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: issueFeedQueryKey(organizationSlug, projectId, issueId),
        }),
      );
    }
    await Promise.all(tasks);
    onSaved?.();
  };

  const patchListCachesForAssignee = (issue: IssueDetailIssue) => {
    if (actorUserId) {
      patchOrganizationIssueListCaches(queryClient, {
        organizationSlug,
        issueId: issue.id,
        assigneeUserId: issue.assigneeUserId,
        assignee: issue.assignee,
        actorUserId,
      });
    }

    patchIssueSheetListCacheForAssignee(queryClient, {
      organizationSlug,
      projectId,
      issueId: issue.id,
      assigneeUserId: issue.assigneeUserId,
      assignee: issue.assignee,
    });
  };

  const updateIssue = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const controller = new AbortController();
      trackAbortController(updateAbortControllersRef.current, controller);
      try {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
          "issue-sheet"
        ][":issueId"].$patch(
          {
            param: { organizationSlug, projectId, issueId },
            json: patch,
          } as never,
          { init: { signal: controller.signal } },
        );
        if (response.status !== 200) {
          const error = await readApiResponseError(response, requestFailed);
          throw new Error(error.message || requestFailed);
        }
        const payload = await response.json();
        if (!isIssueDetailIssue(payload.issue)) {
          throw new Error(requestFailed);
        }
        return { issue: payload.issue };
      } finally {
        releaseAbortController(updateAbortControllersRef.current, controller);
      }
    },
    onSuccess: async (result, patch) => {
      queryClient.setQueryData(
        issueDetailQueryKey(organizationSlug, projectId, issueId),
        (current: IssueDetailIssue | undefined) => mergeIssuePatch(current, patch, result.issue),
      );
      if (Object.hasOwn(patch, "assigneeUserId")) {
        patchListCachesForAssignee(result.issue);
      }
      await invalidate(patch);
    },
    onError: (error) => {
      if (isAbortError(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : requestFailed);
    },
  });

  const setValue = useMutation({
    mutationFn: async ({ columnKey, value }: { columnKey: string; value: unknown }) => {
      const controller = new AbortController();
      trackAbortController(setValueAbortControllersRef.current, controller);
      try {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
          "issue-sheet"
        ][":issueId"].values.$patch(
          {
            param: { organizationSlug, projectId, issueId },
            json: { columnKey, value },
          } as never,
          { init: { signal: controller.signal } },
        );
        if (response.status !== 200) {
          const error = await readApiResponseError(response, requestFailed);
          throw new Error(error.message || requestFailed);
        }
        return response.json();
      } finally {
        releaseAbortController(setValueAbortControllersRef.current, controller);
      }
    },
    onSuccess: () => invalidate(),
    onError: (error) => {
      if (isAbortError(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : requestFailed);
    },
  });

  const cancelPending = () => {
    for (const controller of updateAbortControllersRef.current) {
      controller.abort();
    }
    for (const controller of setValueAbortControllersRef.current) {
      controller.abort();
    }
    updateAbortControllersRef.current.clear();
    setValueAbortControllersRef.current.clear();
    updateIssue.reset();
    setValue.reset();
  };

  return { updateIssue, setValue, cancelPending };
}
