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
import { hasWorkspaceAutomationWebflowTool } from "@/lib/agents/workspace-automation-types";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isWebflowJsonSourcePath, type WebflowPushItem } from "@/lib/webflow/push-eligibility";

export type ContentEditorWebflowPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
};

export function contentEditorWebflowPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-webflow-push", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-webflow-push", organizationSlug, projectId] as const);
}

export function invalidateContentEditorWebflowPushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorWebflowPushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const WEBFLOW_PUSH_DETAIL_CONCURRENCY = 3;

export async function fetchContentEditorWebflowPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorWebflowPushCandidate[]> {
  if (!input.sourcePath || !isWebflowJsonSourcePath(input.sourcePath)) {
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

  const webflowAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationWebflowTool(automation.toolConfig),
  );

  if (webflowAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    webflowAutomations,
    WEBFLOW_PUSH_DETAIL_CONCURRENCY,
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
      const webflowPush = body.webflowPush as
        | { eligibleLocaleCount?: number; pushRunInProgress?: boolean }
        | null
        | undefined;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: webflowPush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: webflowPush?.pushRunInProgress ?? false,
      } satisfies ContentEditorWebflowPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorWebflowPushCandidate => entry != null);
}

export type ContentEditorWebflowIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export function contentEditorWebflowIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-webflow-ingest", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-webflow-ingest", organizationSlug, projectId] as const);
}

export async function fetchContentEditorWebflowIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorWebflowIngestCandidate[]> {
  if (!input.sourcePath || !isWebflowJsonSourcePath(input.sourcePath)) {
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

  const webflowAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationWebflowTool(automation.toolConfig),
  );
  if (webflowAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    webflowAutomations,
    WEBFLOW_PUSH_DETAIL_CONCURRENCY,
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
        runInProgress: (body.recentRuns ?? []).some(
          (run: { status?: string }) => run.status === "queued" || run.status === "running",
        ),
      } satisfies ContentEditorWebflowIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorWebflowIngestCandidate => entry != null);
}

export function contentEditorWebflowPushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-webflow-push-items", organizationSlug, automationId] as const;
}

export function webflowItemTitleFromSourcePath(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  return filename.replace(/\.json$/i, "") || sourcePath;
}

export function defaultSelectedWebflowPushSourcePaths(
  items: readonly WebflowPushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorWebflowPushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<WebflowPushItem[]> {
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
    throw new Error("Failed to load Webflow push items");
  }
  const body = await response.json();
  const items = (body.webflowPush as { items?: WebflowPushItem[] } | null)?.items ?? [];
  return items.filter((item) => isWebflowJsonSourcePath(item.sourcePath));
}
