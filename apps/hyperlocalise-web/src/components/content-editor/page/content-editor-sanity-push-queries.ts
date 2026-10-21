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
import { hasWorkspaceAutomationSanityTool } from "@/lib/agents/workspace-automation-types";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isSanityCatSourcePath, isSanityPluginSourcePath } from "@/lib/sanity/segment-file";

export type ContentEditorSanityPushCandidate = {
  automationId: string;
  name: string;
  eligibleLocaleCount: number;
  pushRunInProgress: boolean;
  overwriteSanityDrafts: boolean;
};

export type ContentEditorSanityPushDocument = {
  documentId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export function contentEditorSanityPushDocumentsQueryKey(
  organizationSlug: string,
  automationId: string,
) {
  return ["content-editor-sanity-push-documents", organizationSlug, automationId] as const;
}

export function contentEditorSanityPushQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-sanity-push", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-sanity-push", organizationSlug, projectId] as const);
}

export function invalidateContentEditorSanityPushQueries(
  queryClient: QueryClient,
  organizationSlug: string,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contentEditorSanityPushQueryKey(organizationSlug, projectId),
  });
}

const automationsApi = createAutomationsApi(apiClient);
const SANITY_PUSH_DETAIL_CONCURRENCY = 3;

export async function fetchContentEditorSanityPushCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorSanityPushCandidate[]> {
  if (!input.sourcePath || !isSanityCatSourcePath(input.sourcePath)) {
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

  const sanityAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationSanityTool(automation.toolConfig),
  );

  if (sanityAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    sanityAutomations,
    SANITY_PUSH_DETAIL_CONCURRENCY,
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
      const sanityPush = body.sanityPush;
      if (!sanityPush || sanityPush.eligibleLocaleCount <= 0) {
        return null;
      }
      return {
        automationId: automation.id,
        name: automation.name,
        eligibleLocaleCount: sanityPush.eligibleLocaleCount,
        pushRunInProgress: sanityPush.pushRunInProgress,
        overwriteSanityDrafts: Boolean(automation.toolConfig.sanity?.overwriteSanityDrafts),
      } satisfies ContentEditorSanityPushCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorSanityPushCandidate => entry != null);
}

export type ContentEditorSanityIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export function contentEditorSanityIngestQueryKey(
  organizationSlug: string,
  projectId: string,
  sourcePath?: string | null,
) {
  return sourcePath
    ? (["content-editor-sanity-ingest", organizationSlug, projectId, sourcePath] as const)
    : (["content-editor-sanity-ingest", organizationSlug, projectId] as const);
}

export async function fetchContentEditorSanityIngestCandidates(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
}): Promise<ContentEditorSanityIngestCandidate[]> {
  if (!input.sourcePath || !isSanityCatSourcePath(input.sourcePath)) {
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

  const sanityAutomations = automations.filter(
    (automation) =>
      automation.status === "active" && hasWorkspaceAutomationSanityTool(automation.toolConfig),
  );
  if (sanityAutomations.length === 0) {
    return [];
  }

  const details = await mapWithConcurrency(
    sanityAutomations,
    SANITY_PUSH_DETAIL_CONCURRENCY,
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
      } satisfies ContentEditorSanityIngestCandidate;
    },
  );

  return details.filter((entry): entry is ContentEditorSanityIngestCandidate => entry != null);
}

export function sanityDocumentTitleFromSourcePath(sourcePath: string): string {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  return filename.replace(/\.json$/i, "") || sourcePath;
}

export function defaultSelectedSanityPushSourcePaths(
  documents: readonly ContentEditorSanityPushDocument[],
  sourcePath: string | null | undefined,
) {
  if (!sourcePath || !documents.some((document) => document.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

export async function fetchContentEditorSanityPushDocuments(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<ContentEditorSanityPushDocument[]> {
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
    throw new Error("Failed to load Sanity push documents");
  }
  const body = await response.json();
  const documents = body.sanityPush?.documents ?? [];
  return documents.filter(
    (document: ContentEditorSanityPushDocument) => !isSanityPluginSourcePath(document.sourcePath),
  );
}
