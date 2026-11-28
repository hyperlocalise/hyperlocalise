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
import { hasWorkspaceAutomationStoryblokTool } from "@/lib/agents/workspace-automation-types";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  isStoryblokJsonSourcePath,
  type StoryblokPushItem,
} from "@/lib/storyblok/storyblok-push-item";

export type ContentEditorStoryblokPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
};

export function contentEditorStoryblokPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-storyblok-push", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-storyblok-push", organizationSlug, projectId] as const);
}

export function invalidateContentEditorStoryblokPushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorStoryblokPushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const STORYBLOK_PUSH_DETAIL_CONCURRENCY = 3;

export async function fetchContentEditorStoryblokPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorStoryblokPushCandidate[]> {
  if (!input.sourcePath || !isStoryblokJsonSourcePath(input.sourcePath)) {
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

  const storyblokAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationStoryblokTool(automation.toolConfig),
  );

  if (storyblokAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    storyblokAutomations,
    STORYBLOK_PUSH_DETAIL_CONCURRENCY,
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
      const storyblokPush = body.storyblokPush as
        | { eligibleLocaleCount?: number; pushRunInProgress?: boolean }
        | null
        | undefined;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: storyblokPush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: storyblokPush?.pushRunInProgress ?? false,
      } satisfies ContentEditorStoryblokPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorStoryblokPushCandidate => entry != null);
}

export type ContentEditorStoryblokIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export function contentEditorStoryblokIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-storyblok-ingest", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-storyblok-ingest", organizationSlug, projectId] as const);
}

export async function fetchContentEditorStoryblokIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorStoryblokIngestCandidate[]> {
  if (!input.sourcePath || !isStoryblokJsonSourcePath(input.sourcePath)) {
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

  const storyblokAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationStoryblokTool(automation.toolConfig),
  );
  if (storyblokAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    storyblokAutomations,
    STORYBLOK_PUSH_DETAIL_CONCURRENCY,
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
      } satisfies ContentEditorStoryblokIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorStoryblokIngestCandidate => entry != null);
}

export function contentEditorStoryblokPushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-storyblok-push-items", organizationSlug, automationId] as const;
}

export function storyblokItemTitleFromSourcePath(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  return filename.replace(/\.json$/i, "") || sourcePath;
}

export function defaultSelectedStoryblokPushSourcePaths(
  items: readonly StoryblokPushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorStoryblokPushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<StoryblokPushItem[]> {
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
    throw new Error("Failed to load Storyblok push items");
  }
  const body = await response.json();
  const items = (body.storyblokPush as { items?: StoryblokPushItem[] } | null)?.items ?? [];
  return items.filter((item) => isStoryblokJsonSourcePath(item.sourcePath));
}
