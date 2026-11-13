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
import { hasWorkspaceAutomationGoogleDriveTool } from "@/lib/agents/workspace-automation-types";
import { isGoogleDriveSourcePath } from "@/lib/google-drive/constants";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

export type ContentEditorGoogleDrivePushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
};

export type ContentEditorGoogleDrivePushFile = {
  driveFileId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: Array<{
    locale: string;
    translationProgress: number;
    approvalProgress: number;
  }>;
  lastPushedAt: string | null;
  lastError: string | null;
};

export function contentEditorGoogleDrivePushFilesQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-google-drive-push-files", organizationSlug, automationId] as const;
}

export function contentEditorGoogleDrivePushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-google-drive-push", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-google-drive-push", organizationSlug, projectId] as const);
}

export function invalidateContentEditorGoogleDrivePushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorGoogleDrivePushQueryKey(organizationSlug, projectId),
  });
}

export type ContentEditorGoogleDriveIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export function contentEditorGoogleDriveIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-google-drive-ingest", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-google-drive-ingest", organizationSlug, projectId] as const);
}

const automationsApi = createAutomationsApi(apiClient);
const GOOGLE_DRIVE_PUSH_DETAIL_CONCURRENCY = 3;

export async function fetchContentEditorGoogleDrivePushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorGoogleDrivePushCandidate[]> {
  if (!input.sourcePath || !isGoogleDriveSourcePath(input.sourcePath)) {
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

  const driveAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      hasWorkspaceAutomationGoogleDriveTool(automation.toolConfig),
  );

  if (driveAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    driveAutomations,
    GOOGLE_DRIVE_PUSH_DETAIL_CONCURRENCY,
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
      const googleDrivePush = body.googleDrivePush;
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: googleDrivePush?.eligibleLocaleCount ?? 0,
        pushRunInProgress: googleDrivePush?.pushRunInProgress ?? false,
      } satisfies ContentEditorGoogleDrivePushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorGoogleDrivePushCandidate => entry != null);
}

export async function fetchContentEditorGoogleDriveIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorGoogleDriveIngestCandidate[]> {
  if (!input.sourcePath || !isGoogleDriveSourcePath(input.sourcePath)) {
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

  const driveAutomations = automations.filter(
    (automation) =>
      automation.status === "active" &&
      hasWorkspaceAutomationGoogleDriveTool(automation.toolConfig),
  );
  if (driveAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    driveAutomations,
    GOOGLE_DRIVE_PUSH_DETAIL_CONCURRENCY,
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
      } satisfies ContentEditorGoogleDriveIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorGoogleDriveIngestCandidate => entry != null);
}

export function googleDriveFileTitleFromSourcePath(sourcePath: string): string {
  return sourcePath.split("/").pop() || sourcePath;
}

export function defaultSelectedGoogleDrivePushSourcePaths(
  files: readonly ContentEditorGoogleDrivePushFile[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !files.some((file) => file.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorGoogleDrivePushFiles(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorGoogleDrivePushFile[]> {
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
    throw new Error("Failed to load Google Drive push files");
  }
  const body = await response.json();
  return body.googleDrivePush?.files ?? [];
}
