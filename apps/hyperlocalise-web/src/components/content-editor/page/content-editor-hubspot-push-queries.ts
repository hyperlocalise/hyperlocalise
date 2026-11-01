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
import { createAutomationsApi } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automations-api";
import { apiClient } from "@/lib/api-client-instance";
import { hasWorkspaceAutomationHubspotTool } from "@/lib/agents/workspace-automation-types";
import type { HubspotPushItem } from "@/lib/hubspot/push-eligibility";
import { isHubspotSourcePath } from "@/lib/hubspot/source-path";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

const automationsApi = createAutomationsApi(apiClient);
const HUBSPOT_PUSH_DETAIL_CONCURRENCY = 3;

export type ContentEditorHubspotIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export type ContentEditorHubspotPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteWhenRemoteNewer: boolean;
};

export type ContentEditorHubspotPushItem = HubspotPushItem;

export function contentEditorHubspotPushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-hubspot-push-items", organizationSlug, automationId] as const;
}

export function contentEditorHubspotIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-hubspot-ingest", organizationSlug, projectId] as const)
    : (["content-editor-hubspot-ingest", organizationSlug, projectId, sourcePath] as const);
}

export function contentEditorHubspotPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-hubspot-push", organizationSlug, projectId] as const)
    : (["content-editor-hubspot-push", organizationSlug, projectId, sourcePath] as const);
}

function readRunInProgress(body: { recentRuns?: Array<{ status?: string }> }) {
  return (body.recentRuns ?? []).some((run) => run.status === "queued" || run.status === "running");
}

async function listActiveHubspotAutomations(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}) {
  if (!input.sourcePath || !isHubspotSourcePath(input.sourcePath)) {
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
  return automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationHubspotTool(automation.toolConfig),
  );
}

export async function fetchContentEditorHubspotIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorHubspotIngestCandidate[]> {
  const automations = await listActiveHubspotAutomations(input);
  if (automations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    automations,
    HUBSPOT_PUSH_DETAIL_CONCURRENCY,
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
        runInProgress: readRunInProgress(body),
      } satisfies ContentEditorHubspotIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorHubspotIngestCandidate => entry != null);
}

export async function fetchContentEditorHubspotPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorHubspotPushCandidate[]> {
  const automations = await listActiveHubspotAutomations(input);
  if (automations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    automations,
    HUBSPOT_PUSH_DETAIL_CONCURRENCY,
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
      const hubspotPush = "hubspotPush" in body ? body.hubspotPush : null;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: hubspotPush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: hubspotPush?.pushRunInProgress ?? false,
        overwriteWhenRemoteNewer: automation.toolConfig.hubspot?.overwriteWhenRemoteNewer !== false,
      } satisfies ContentEditorHubspotPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorHubspotPushCandidate => entry != null);
}

export function defaultSelectedHubspotPushSourcePaths(
  items: readonly ContentEditorHubspotPushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorHubspotPushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorHubspotPushItem[]> {
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
    throw new Error("Failed to load HubSpot push items");
  }
  const body = await response.json();
  return ("hubspotPush" in body ? body.hubspotPush?.items : undefined) ?? [];
}

export function invalidateContentEditorHubspotPushQueries(
  queryClient: { invalidateQueries: (input: { queryKey: readonly unknown[] }) => void },
  organizationSlug: string,
  projectId: string,
) {
  queryClient.invalidateQueries({
    queryKey: contentEditorHubspotPushQueryKey(organizationSlug, projectId),
  });
}

export { readRunInProgress };
