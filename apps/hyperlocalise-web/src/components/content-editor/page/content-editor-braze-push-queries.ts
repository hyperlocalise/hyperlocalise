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
import {
  hasWorkspaceAutomationBrazeCampaignsTool,
  hasWorkspaceAutomationBrazeTool,
} from "@/lib/agents/workspace-automation-types";
import { isBrazeCampaignSourcePath, isBrazeTemplateSourcePath } from "@/lib/braze/translation-map";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

export type ContentEditorBrazePushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteWhenRemoteNewer: boolean;
};

export type ContentEditorBrazePushItem = {
  sourceId: string;
  sourcePath: string;
  resourceKind: "email_template" | "content_block" | "campaign" | "canvas_step";
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export function contentEditorBrazePushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-braze-push-items", organizationSlug, automationId] as const;
}

export function contentEditorBrazePushQueryKey(organizationSlug: string, projectId: string) {
  return ["content-editor-braze-push", organizationSlug, projectId] as const;
}

export function invalidateContentEditorBrazePushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorBrazePushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const BRAZE_PUSH_DETAIL_CONCURRENCY = 3;

export type ContentEditorBrazeIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
  kind: "templates" | "campaigns";
};

function brazeAutomationMatchesSourcePath(
  toolConfig: Parameters<typeof hasWorkspaceAutomationBrazeTool>[0],
  sourcePath?: string | null,
) {
  const isTemplates = hasWorkspaceAutomationBrazeTool(toolConfig);
  const isCampaigns = hasWorkspaceAutomationBrazeCampaignsTool(toolConfig);
  if (sourcePath && isBrazeCampaignSourcePath(sourcePath)) {
    return isCampaigns;
  }
  if (sourcePath && isBrazeTemplateSourcePath(sourcePath)) {
    return isTemplates;
  }
  return isTemplates || isCampaigns;
}

function readRecentRunsInProgress(body: { recentRuns?: Array<{ status?: string }> }) {
  return (body.recentRuns ?? []).some((run) => run.status === "queued" || run.status === "running");
}

export async function fetchContentEditorBrazePushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorBrazePushCandidate[]> {
  let automations;
  try {
    automations = await automationsApi.listAutomations(input.organizationSlug, {
      projectId: input.projectId,
    });
  } catch {
    return [];
  }

  const brazeAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      brazeAutomationMatchesSourcePath(automation.toolConfig, input.sourcePath),
  );

  if (brazeAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    brazeAutomations,
    BRAZE_PUSH_DETAIL_CONCURRENCY,
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
      const brazePush = "brazePush" in body ? body.brazePush : null;
      if (!brazePush || brazePush.eligibleLocaleCount <= 0) {
        return null;
      }
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: brazePush.eligibleLocaleCount,
        pushRunInProgress: brazePush.pushRunInProgress,
        overwriteWhenRemoteNewer:
          (automation.toolConfig.brazeCampaigns?.overwriteWhenRemoteNewer ??
            automation.toolConfig.braze?.overwriteWhenRemoteNewer) !== false,
      } satisfies ContentEditorBrazePushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorBrazePushCandidate => entry != null);
}

export function brazeItemTitleFromSourcePath(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  return filename.replace(/\.(html|json)$/i, "") || sourcePath;
}

export function contentEditorBrazeIngestQueryKey(organizationSlug: string, projectId: string) {
  return ["content-editor-braze-ingest", organizationSlug, projectId] as const;
}

export async function fetchContentEditorBrazeIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorBrazeIngestCandidate[]> {
  let automations;
  try {
    automations = await automationsApi.listAutomations(input.organizationSlug, {
      projectId: input.projectId,
    });
  } catch {
    return [];
  }

  const brazeAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      brazeAutomationMatchesSourcePath(automation.toolConfig, input.sourcePath),
  );
  if (brazeAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    brazeAutomations,
    BRAZE_PUSH_DETAIL_CONCURRENCY,
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
        kind: hasWorkspaceAutomationBrazeCampaignsTool(automation.toolConfig)
          ? "campaigns"
          : "templates",
      } satisfies ContentEditorBrazeIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorBrazeIngestCandidate => entry != null);
}

export function defaultSelectedBrazePushSourcePaths(
  items: readonly ContentEditorBrazePushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorBrazePushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorBrazePushItem[]> {
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
    throw new Error("Failed to load Braze push items");
  }
  const body = await response.json();
  return ("brazePush" in body ? body.brazePush?.items : undefined) ?? [];
}
