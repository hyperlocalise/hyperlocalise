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
import { hasWorkspaceAutomationIntercomTool } from "@/lib/agents/workspace-automation-types";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

export type ContentEditorIntercomPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteIntercomDrafts: boolean;
};

export type ContentEditorIntercomPushArticle = {
  articleId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export function contentEditorIntercomPushArticlesQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-intercom-push-articles", organizationSlug, automationId] as const;
}

export function contentEditorIntercomPushQueryKey(organizationSlug: string, projectId: string) {
  return ["content-editor-intercom-push", organizationSlug, projectId] as const;
}

export function invalidateContentEditorIntercomPushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorIntercomPushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const INTERCOM_PUSH_DETAIL_CONCURRENCY = 3;

export async function fetchContentEditorIntercomPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
}): Promise<ContentEditorIntercomPushCandidate[]> {
  let automations;
  try {
    automations = await automationsApi.listAutomations(input.organizationSlug, {
      projectId: input.projectId,
    });
  } catch {
    return [];
  }

  const intercomAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationIntercomTool(automation.toolConfig),
  );

  if (intercomAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    intercomAutomations,
    INTERCOM_PUSH_DETAIL_CONCURRENCY,
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
      const intercomPush = body.intercomPush;
      if (!intercomPush || intercomPush.eligibleLocaleCount <= 0) {
        return null;
      }
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: intercomPush.eligibleLocaleCount,
        pushRunInProgress: intercomPush.pushRunInProgress,
        overwriteIntercomDrafts: Boolean(automation.toolConfig.intercom?.overwriteIntercomDrafts),
      } satisfies ContentEditorIntercomPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorIntercomPushCandidate => entry != null);
}

export function intercomArticleTitleFromSourcePath(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  return filename.replace(/\.md$/i, "") || sourcePath;
}

export function defaultSelectedIntercomPushSourcePaths(
  articles: readonly ContentEditorIntercomPushArticle[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !articles.some((article) => article.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorIntercomPushArticles(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorIntercomPushArticle[]> {
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
    throw new Error("Failed to load Intercom push articles");
  }
  const body = await response.json();
  return body.intercomPush?.articles ?? [];
}
