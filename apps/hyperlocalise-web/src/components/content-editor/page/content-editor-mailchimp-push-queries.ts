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
import { hasWorkspaceAutomationMailchimpTool } from "@/lib/agents/workspace-automation-types";
import type { MailchimpPushItem } from "@/lib/mailchimp/push-eligibility";
import { isMailchimpSourcePath } from "@/lib/mailchimp/html-envelope";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

const automationsApi = createAutomationsApi(apiClient);
const MAILCHIMP_PUSH_DETAIL_CONCURRENCY = 3;

export type ContentEditorMailchimpIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export type ContentEditorMailchimpPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteWhenRemoteNewer: boolean;
};

export type ContentEditorMailchimpPushItem = MailchimpPushItem;

export function contentEditorMailchimpPushItemsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-mailchimp-push-items", organizationSlug, automationId] as const;
}

export function contentEditorMailchimpIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-mailchimp-ingest", organizationSlug, projectId] as const)
    : (["content-editor-mailchimp-ingest", organizationSlug, projectId, sourcePath] as const);
}

export function contentEditorMailchimpPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-mailchimp-push", organizationSlug, projectId] as const)
    : (["content-editor-mailchimp-push", organizationSlug, projectId, sourcePath] as const);
}

function readRunInProgress(body: { recentRuns?: Array<{ status?: string }> }) {
  return (body.recentRuns ?? []).some((run) => run.status === "queued" || run.status === "running");
}

async function listActiveMailchimpAutomations(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}) {
  if (!input.sourcePath || !isMailchimpSourcePath(input.sourcePath)) {
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
      automation.status === "active" && hasWorkspaceAutomationMailchimpTool(automation.toolConfig),
  );
}

export async function fetchContentEditorMailchimpIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorMailchimpIngestCandidate[]> {
  const automations = await listActiveMailchimpAutomations(input);
  if (automations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    automations,
    MAILCHIMP_PUSH_DETAIL_CONCURRENCY,
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
      } satisfies ContentEditorMailchimpIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorMailchimpIngestCandidate => entry != null);
}

export async function fetchContentEditorMailchimpPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorMailchimpPushCandidate[]> {
  const automations = await listActiveMailchimpAutomations(input);
  if (automations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    automations,
    MAILCHIMP_PUSH_DETAIL_CONCURRENCY,
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
      const mailchimpPush = "mailchimpPush" in body ? body.mailchimpPush : null;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: mailchimpPush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: mailchimpPush?.pushRunInProgress ?? false,
        overwriteWhenRemoteNewer:
          automation.toolConfig.mailchimp?.overwriteWhenRemoteNewer !== false,
      } satisfies ContentEditorMailchimpPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorMailchimpPushCandidate => entry != null);
}

export function defaultSelectedMailchimpPushSourcePaths(
  items: readonly ContentEditorMailchimpPushItem[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !items.some((item) => item.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorMailchimpPushItems(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorMailchimpPushItem[]> {
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
    throw new Error("Failed to load Mailchimp push items");
  }
  const body = await response.json();
  return ("mailchimpPush" in body ? body.mailchimpPush?.items : undefined) ?? [];
}

export function invalidateContentEditorMailchimpPushQueries(
  queryClient: { invalidateQueries: (input: { queryKey: readonly unknown[] }) => void },
  organizationSlug: string,
  projectId: string,
) {
  queryClient.invalidateQueries({
    queryKey: contentEditorMailchimpPushQueryKey(organizationSlug, projectId),
  });
}

export { readRunInProgress };
