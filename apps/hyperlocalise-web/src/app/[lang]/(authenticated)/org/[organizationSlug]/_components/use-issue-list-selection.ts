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
import { useCallback, useEffect, useMemo, useState } from "react";

import type { IssueGroupedListItem } from "./issue-grouped-list";
import { ISSUE_BULK_ACTION_MAX_ITEMS } from "@/api/routes/issues/issues-bulk.schema";

export type IssueListSelectionTarget = {
  issueId: string;
  projectId: string;
};

function issueIdFromTarget(target: { issueId?: string; id?: string; projectId: string }) {
  const issueId = target.issueId ?? target.id;
  if (!issueId) {
    throw new Error("Issue selection target is missing issue id");
  }

  return issueId;
}

function selectionKey(target: { issueId?: string; id?: string; projectId: string }) {
  return `${target.projectId}:${issueIdFromTarget(target)}`;
}

export function useIssueListSelection(issues: IssueGroupedListItem[]) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const loadedKeys = useMemo(() => new Set(issues.map((issue) => selectionKey(issue))), [issues]);

  const loadedTargets = useMemo(
    () =>
      issues.map((issue) => ({
        issueId: issue.id,
        projectId: issue.projectId,
      })),
    [issues],
  );

  useEffect(() => {
    setSelectedKeys((current) => {
      const next = new Set([...current].filter((key) => loadedKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [loadedKeys]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const resetSelectionForFilterChange = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const toggleIssue = useCallback(
    (target: { issueId?: string; id?: string; projectId: string }, checked: boolean) => {
      const key = selectionKey(target);
      setSelectedKeys((current) => {
        const next = new Set(current);
        if (checked) {
          if (next.size >= ISSUE_BULK_ACTION_MAX_ITEMS) {
            return current;
          }
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
    },
    [],
  );

  const selectAllLoaded = useCallback(() => {
    setSelectedKeys(new Set([...loadedKeys].slice(0, ISSUE_BULK_ACTION_MAX_ITEMS)));
  }, [loadedKeys]);

  const selectedTargets = useMemo(() => {
    return loadedTargets.filter((target) => selectedKeys.has(selectionKey(target)));
  }, [loadedTargets, selectedKeys]);

  const selectedProjectIds = useMemo(() => {
    return new Set(selectedTargets.map((target) => target.projectId));
  }, [selectedTargets]);

  const allLoadedSelected =
    loadedKeys.size > 0 &&
    loadedKeys.size === selectedKeys.size &&
    [...loadedKeys].every((key) => selectedKeys.has(key));

  const someSelected = selectedKeys.size > 0;

  const applyBulkResult = useCallback(
    (failedIssueIds: string[]) => {
      if (failedIssueIds.length === 0) {
        clearSelection();
        return;
      }
      const failedKeys = new Set(
        selectedTargets
          .filter((target) => failedIssueIds.includes(target.issueId))
          .map((target) => selectionKey(target)),
      );
      setSelectedKeys(failedKeys);
    },
    [clearSelection, selectedTargets],
  );

  return {
    selectedKeys,
    selectedCount: selectedKeys.size,
    selectedTargets,
    selectedProjectIds,
    allLoadedSelected,
    someSelected,
    selectionLimitReached: selectedKeys.size >= ISSUE_BULK_ACTION_MAX_ITEMS,
    toggleIssue,
    selectAllLoaded,
    clearSelection,
    resetSelectionForFilterChange,
    applyBulkResult,
    isIssueSelected: (target: { issueId?: string; id?: string; projectId: string }) =>
      selectedKeys.has(selectionKey(target)),
  };
}
