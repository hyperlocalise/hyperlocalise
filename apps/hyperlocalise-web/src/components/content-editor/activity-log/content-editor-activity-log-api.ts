"use client";

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
import type { ActivityLogItem } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/settings/_components/activity-log-list";
import {
  canUseGoSvcCat,
  type ContentEditorProjectSource,
} from "@/components/content-editor/shared/content-editor-native-project";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { CatRevisionActorKind } from "@/lib/go-svc/go-svc-cat-revisions.types";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";

export type ContentEditorActivityLogQuery = {
  sourcePath: string;
  segmentId?: string;
  targetLocale?: string;
  cursor?: string;
  limit?: number;
  eventTypes?: string;
  actorKind?: CatRevisionActorKind;
  since?: string;
};

export type ContentEditorActivityLogPage = {
  activityLogs: ActivityLogItem[];
  nextCursor: string | null;
};

/** Native CAT activity is served by go-svc; connected TMS activity stays on Hono. */
export async function fetchContentEditorActivityLogs(input: {
  goSvcClient: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  projectSource?: ContentEditorProjectSource | null;
  query: ContentEditorActivityLogQuery;
  /** Localized message used when the server gives no usable error. */
  errorMessage: string;
  signal?: AbortSignal;
}): Promise<ContentEditorActivityLogPage> {
  const { query } = input;
  if (canUseGoSvcCat({ projectId: input.projectId, projectSource: input.projectSource })) {
    let result: Awaited<ReturnType<GoSvcClient["cat"]["activityLogs"]>>;
    try {
      result = await input.goSvcClient.cat.activityLogs(
        input.organizationSlug,
        input.projectId,
        { ...query, limit: query.limit ?? 50 },
        { signal: input.signal },
      );
    } catch (error) {
      throw new Error(goSvcErrorMessage(error, input.errorMessage));
    }
    return {
      activityLogs: result.activityLogs as unknown as ActivityLogItem[],
      nextCursor: result.nextCursor ?? null,
    };
  }

  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat["activity-logs"].$get(
    {
      param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
      query: {
        sourcePath: query.sourcePath,
        ...(query.segmentId ? { segmentId: query.segmentId } : {}),
        ...(query.targetLocale ? { targetLocale: query.targetLocale } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.eventTypes ? { eventTypes: query.eventTypes } : {}),
        ...(query.actorKind ? { actorKind: query.actorKind } : {}),
        ...(query.since ? { since: query.since } : {}),
        limit: String(query.limit ?? 50),
      },
    },
    { init: { signal: input.signal } },
  );
  if (response.status !== 200) {
    throw new Error(await readApiError(response, input.errorMessage));
  }
  const body = await response.json();
  return {
    activityLogs: body.activityLogs as ActivityLogItem[],
    nextCursor: body.nextCursor,
  };
}
