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

export type ContentEditorIntercomPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
};

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

  const details = await Promise.all(
    intercomAutomations.map(async (automation) => {
      const response = await apiClient.api.orgs[":organizationSlug"].automations[
        ":automationId"
      ].$get({
        param: {
          organizationSlug: input.organizationSlug,
          automationId: automation.id,
        },
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
      } satisfies ContentEditorIntercomPushCandidate;
    }),
  );

  return details.filter((entry): entry is ContentEditorIntercomPushCandidate => entry != null);
}
