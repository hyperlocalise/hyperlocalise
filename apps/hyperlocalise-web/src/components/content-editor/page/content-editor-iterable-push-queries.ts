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
import type { QueryClient } from "@tanstack/react-query";

import { createAutomationsApi } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automations-api";
import { apiClient } from "@/lib/api-client-instance";
import { hasWorkspaceAutomationIterableTool } from "@/lib/agents/workspace-automation-types";
import type { IterablePushItem } from "@/lib/iterable/push-eligibility";
import { isIterableSourcePath } from "@/lib/iterable/source-path";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

export type ContentEditorIterablePushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteWhenRemoteNewer: boolean;
};

export type ContentEditorIterablePushItem = IterablePushItem;

export function contentEditorIterablePushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-iterable-push-items", organizationSlug, automationId] as const;
}

export function contentEditorIterablePushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-iterable-push", organizationSlug, projectId] as const)
    : (["content-editor-iterable-push", organizationSlug, projectId, sourcePath] as const);
}

export function invalidateContentEditorIterablePushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorIterablePushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const CUSTOMER_IO_PUSH_DETAIL_CONCURRENCY = 3;

function iterableAutomationMatchesSourcePath(
  toolConfig: Parameters<typeof hasWorkspaceAutomationIterableTool>[0],
  sourcePath?: string | null,
) {
  if (!sourcePath || !isIterableSourcePath(sourcePath)) {
    return false;
  }
  return hasWorkspaceAutomationIterableTool(toolConfig);
}

function readRecentRunsInProgress(body: { recentRuns?: Array<{ status?: string }> }) {
  return (body.recentRuns ?? []).some((run) => run.status === "queued" || run.status === "running");
}

export async function fetchContentEditorIterablePushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorIterablePushCandidate[]> {
  if (!input.sourcePath || !isIterableSourcePath(input.sourcePath)) {
    return [];
  }
  let automations;
  try {
    automations = await automationsApi.listAutomations(input.organizationSlug, {
      projectId: input.projectId,
    });
  } catch {
    return [];
  }

  const iterableAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      iterableAutomationMatchesSourcePath(automation.toolConfig, input.sourcePath),
  );

  if (iterableAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    iterableAutomations,
    CUSTOMER_IO_PUSH_DETAIL_CONCURRENCY,
    async (automation) => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$get({
        param: {
          organizationSlug: input.organizationSlug,
          automationId: automation.id,
        },
        query: {},
      });
      if (!response.ok) {
        return null;
      }
      const body = await response.json();
      const iterablePush = "iterablePush" in body ? body.iterablePush : null;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: iterablePush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: iterablePush?.pushRunInProgress ?? false,
        overwriteWhenRemoteNewer: true as boolean,
      } satisfies ContentEditorIterablePushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorIterablePushCandidate => entry != null);
}

export function contentEditorIterableIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-iterable-ingest", organizationSlug, projectId] as const)
    : (["content-editor-iterable-ingest", organizationSlug, projectId, sourcePath] as const);
}

export async function fetchContentEditorIterableIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<Array<{ automationId: string; name: string; runInProgress: boolean }>> {
  if (!input.sourcePath || !isIterableSourcePath(input.sourcePath)) {
    return [];
  }
  let automations;
  try {
    automations = await automationsApi.listAutomations(input.organizationSlug, {
      projectId: input.projectId,
    });
  } catch {
    return [];
  }

  const iterableAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      iterableAutomationMatchesSourcePath(automation.toolConfig, input.sourcePath),
  );
  if (iterableAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    iterableAutomations,
    CUSTOMER_IO_PUSH_DETAIL_CONCURRENCY,
    async (automation) => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$get({
        param: {
          organizationSlug: input.organizationSlug,
          automationId: automation.id,
        },
        query: {},
      });
      if (!response.ok) {
        return null;
      }
      const body = await response.json();
      return {
        automationId: automation.id,
        name: automation.name,
        runInProgress: readRecentRunsInProgress(body),
      };
    },
  );

  return details.filter(
    (entry): entry is { automationId: string; name: string; runInProgress: boolean } =>
      entry != null,
  );
}

export function defaultSelectedIterablePushSourcePaths(
  items: readonly ContentEditorIterablePushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorIterablePushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorIterablePushItem[]> {
  const response = await apiClient.api.orgs[":organizationSlug"].automations[":automationId"].$get({
    param: {
      organizationSlug: input.organizationSlug,
      automationId: input.automationId,
    },
    query: {
      includePushArticles: "true",
    },
  });
  if (!response.ok) {
    throw new Error("Failed to load Iterable push items");
  }
  const body = await response.json();
  return ("iterablePush" in body ? body.iterablePush?.items : undefined) ?? [];
}
