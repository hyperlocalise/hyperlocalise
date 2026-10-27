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
import { hasWorkspaceAutomationCustomerIoTool } from "@/lib/agents/workspace-automation-types";
import type { CustomerIoPushItem } from "@/lib/customer-io/push-eligibility";
import { isCustomerIoSourcePath } from "@/lib/customer-io/translation-map";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

export type ContentEditorCustomerIoPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteWhenRemoteNewer: boolean;
};

export type ContentEditorCustomerIoPushItem = CustomerIoPushItem;

export function contentEditorCustomerIoPushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-customer-io-push-items", organizationSlug, automationId] as const;
}

export function contentEditorCustomerIoPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-customer-io-push", organizationSlug, projectId] as const)
    : (["content-editor-customer-io-push", organizationSlug, projectId, sourcePath] as const);
}

export function invalidateContentEditorCustomerIoPushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorCustomerIoPushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const CUSTOMER_IO_PUSH_DETAIL_CONCURRENCY = 3;

function customerIoAutomationMatchesSourcePath(
  toolConfig: Parameters<typeof hasWorkspaceAutomationCustomerIoTool>[0],
  sourcePath?: string | null,
) {
  if (!sourcePath || !isCustomerIoSourcePath(sourcePath)) {
    return false;
  }
  return hasWorkspaceAutomationCustomerIoTool(toolConfig);
}

function readRecentRunsInProgress(body: { recentRuns?: Array<{ status?: string }> }) {
  return (body.recentRuns ?? []).some((run) => run.status === "queued" || run.status === "running");
}

export async function fetchContentEditorCustomerIoPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorCustomerIoPushCandidate[]> {
  if (!input.sourcePath || !isCustomerIoSourcePath(input.sourcePath)) {
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

  const customerIoAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      customerIoAutomationMatchesSourcePath(automation.toolConfig, input.sourcePath),
  );

  if (customerIoAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    customerIoAutomations,
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
      const customerIoPush = "customerIoPush" in body ? body.customerIoPush : null;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: customerIoPush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: customerIoPush?.pushRunInProgress ?? false,
        overwriteWhenRemoteNewer:
          automation.toolConfig.customerIo?.overwriteWhenRemoteNewer !== false,
      } satisfies ContentEditorCustomerIoPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorCustomerIoPushCandidate => entry != null);
}

export function contentEditorCustomerIoIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-customer-io-ingest", organizationSlug, projectId] as const)
    : (["content-editor-customer-io-ingest", organizationSlug, projectId, sourcePath] as const);
}

export async function fetchContentEditorCustomerIoIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<Array<{ automationId: string; name: string; runInProgress: boolean }>> {
  if (!input.sourcePath || !isCustomerIoSourcePath(input.sourcePath)) {
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

  const customerIoAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      customerIoAutomationMatchesSourcePath(automation.toolConfig, input.sourcePath),
  );
  if (customerIoAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    customerIoAutomations,
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

export function defaultSelectedCustomerIoPushSourcePaths(
  items: readonly ContentEditorCustomerIoPushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorCustomerIoPushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorCustomerIoPushItem[]> {
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
    throw new Error("Failed to load Customer.io push items");
  }
  const body = await response.json();
  return ("customerIoPush" in body ? body.customerIoPush?.items : undefined) ?? [];
}
