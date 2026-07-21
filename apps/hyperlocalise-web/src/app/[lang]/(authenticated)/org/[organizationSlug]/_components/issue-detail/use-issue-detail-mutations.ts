"use client";

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
  const updateAbortRef = useRef<AbortController | null>(null);
  const setValueAbortRef = useRef<AbortController | null>(null);

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
      updateAbortRef.current?.abort();
      const controller = new AbortController();
      updateAbortRef.current = controller;
      const response = await fetch(`${issueSheetApiPath(organizationSlug, projectId)}/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return readJsonOrThrow<{ issue: IssueDetailIssue }>(response, requestFailed);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(
        issueDetailQueryKey(organizationSlug, projectId, issueId),
        result.issue,
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
      setValueAbortRef.current?.abort();
      const controller = new AbortController();
      setValueAbortRef.current = controller;
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
    updateAbortRef.current?.abort();
    setValueAbortRef.current?.abort();
    updateAbortRef.current = null;
    setValueAbortRef.current = null;
    updateIssue.reset();
    setValue.reset();
  };

  return { updateIssue, setValue, cancelPending };
}
