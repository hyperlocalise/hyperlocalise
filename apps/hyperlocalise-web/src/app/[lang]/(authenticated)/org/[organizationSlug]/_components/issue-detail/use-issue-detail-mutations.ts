"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiResponseError } from "@/lib/api-error";

import { issueDetailPanelMessages as messages } from "./issue-detail-panel.messages";
import { issueSheetApiPath, type IssueDetailIssue } from "./issue-detail-utils";
import { issueDetailQueryKey } from "./use-issue-detail-query";

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, fallbackMessage);
    throw new Error(error.message || fallbackMessage);
  }
  return (await response.json()) as T;
}

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
  onSaved,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  onSaved?: () => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const requestFailed = intl.formatMessage(messages.updateFailed);
  const updateAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const setValueAbortControllersRef = useRef<Set<AbortController>>(new Set());

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: issueDetailQueryKey(organizationSlug, projectId, issueId),
      }),
      queryClient.invalidateQueries({ queryKey: ["issue-sheet", organizationSlug, projectId] }),
      queryClient.invalidateQueries({ queryKey: ["organization-issues", organizationSlug] }),
    ]);
    onSaved?.();
  };

  const updateIssue = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const controller = new AbortController();
      trackAbortController(updateAbortControllersRef.current, controller);
      try {
        const response = await fetch(
          `${issueSheetApiPath(organizationSlug, projectId)}/${issueId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        return readJsonOrThrow<{ issue: IssueDetailIssue }>(response, requestFailed);
      } finally {
        releaseAbortController(updateAbortControllersRef.current, controller);
      }
    },
    onSuccess: async (result, body) => {
      queryClient.setQueryData(
        issueDetailQueryKey(organizationSlug, projectId, issueId),
        (current: IssueDetailIssue | undefined) => mergeIssuePatch(current, body, result.issue),
      );
      await invalidate();
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
        const response = await fetch(
          `${issueSheetApiPath(organizationSlug, projectId)}/${issueId}/values`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ columnKey, value }),
            signal: controller.signal,
          },
        );
        return readJsonOrThrow<{ value: unknown }>(response, requestFailed);
      } finally {
        releaseAbortController(setValueAbortControllersRef.current, controller);
      }
    },
    onSuccess: invalidate,
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
