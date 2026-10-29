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
import { hasWorkspaceAutomationLoopsTool } from "@/lib/agents/workspace-automation-types";
import { isLoopsSourcePath } from "@/lib/loops/source-path";

const automationsApi = createAutomationsApi(apiClient);

export type ContentEditorLoopsIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export type ContentEditorLoopsPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
};

export function contentEditorLoopsIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-loops-ingest", organizationSlug, projectId] as const)
    : (["content-editor-loops-ingest", organizationSlug, projectId, sourcePath] as const);
}

export function contentEditorLoopsPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath === undefined
    ? (["content-editor-loops-push", organizationSlug, projectId] as const)
    : (["content-editor-loops-push", organizationSlug, projectId, sourcePath] as const);
}

function readRunInProgress(body: { recentRuns?: Array<{ status?: string }> }) {
  return (body.recentRuns ?? []).some((run) => run.status === "queued" || run.status === "running");
}

async function listActiveLoopsAutomations(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}) {
  if (!input.sourcePath || !isLoopsSourcePath(input.sourcePath)) {
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
      automation.status === "active" && hasWorkspaceAutomationLoopsTool(automation.toolConfig),
  );
}

export async function fetchContentEditorLoopsIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorLoopsIngestCandidate[]> {
  const automations = await listActiveLoopsAutomations(input);
  return automations.map((automation) => ({
    automationId: automation.id,
    name: automation.name,
    runInProgress: false,
  }));
}

export async function fetchContentEditorLoopsPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorLoopsPushCandidate[]> {
  const automations = await listActiveLoopsAutomations(input);
  return automations.map((automation) => ({
    automationId: automation.id,
    name: automation.name,
    eligibleLocaleCount: 1,
    pushRunInProgress: false,
  }));
}

export function invalidateContentEditorLoopsPushQueries(
  queryClient: { invalidateQueries: (input: { queryKey: readonly unknown[] }) => void },
  organizationSlug: string,
  projectId: string,
) {
  queryClient.invalidateQueries({
    queryKey: contentEditorLoopsPushQueryKey(organizationSlug, projectId),
  });
}

export { readRunInProgress };
