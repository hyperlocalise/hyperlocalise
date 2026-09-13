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
import "server-only";

import {
  PRODUCT_USAGE_ANALYTICS_EVENTS,
  productUsageSourceForActorKind,
} from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { normalizeSourcePath } from "@/lib/file-storage/records";

import type { ActivityActorKind } from "./activity-log-contract";
import { enqueueActivityLogEvent } from "./activity-log-writer";

export type ActivityActor = {
  actorCredentialId: string | null;
  actorKind: ActivityActorKind;
  actorUserId: string | null;
};

function activityActor(input: ActivityActor) {
  return {
    actorCredentialId: input.actorCredentialId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
  };
}

export function fileActivityFileName(sourcePath: string): string {
  const normalized = normalizeSourcePath(sourcePath);
  return normalized.split("/").filter(Boolean).at(-1) || normalized;
}

export function fileActivityTargetId(projectId: string, sourcePath: string): string {
  return `${projectId}:${normalizeSourcePath(sourcePath)}`;
}

function filePayload(input: {
  projectId: string;
  sourcePath: string;
  storedFileId?: string | null;
  versionId?: string | null;
}) {
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const fileName = fileActivityFileName(sourcePath);
  return {
    fileName,
    name: fileName,
    projectId: input.projectId,
    sourcePath,
    ...(input.storedFileId ? { storedFileId: input.storedFileId } : {}),
    ...(input.versionId ? { versionId: input.versionId } : {}),
  };
}

function segmentPayload(input: {
  itemCount?: number;
  projectId: string;
  segmentId: string;
  sourcePath: string;
  targetLocale?: string | null;
}) {
  const sourcePath = normalizeSourcePath(input.sourcePath);
  const fileName = fileActivityFileName(sourcePath);
  return {
    fileName,
    name: fileName,
    projectId: input.projectId,
    segmentId: input.segmentId,
    sourcePath,
    ...(input.targetLocale ? { targetLocale: input.targetLocale } : {}),
    ...(input.itemCount && input.itemCount > 1 ? { itemCount: input.itemCount } : {}),
  };
}

type FileActivityInput = ActivityActor & {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  storedFileId?: string | null;
  versionId?: string | null;
};

export async function enqueueFileUploadedActivity(input: FileActivityInput) {
  serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.fileUploaded, {
    status: "created",
    source: productUsageSourceForActorKind(input.actorKind),
  });
  const payload = filePayload(input);
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "file_uploaded",
    organizationId: input.organizationId,
    payload,
    targetId: fileActivityTargetId(input.projectId, payload.sourcePath),
    targetKind: "file",
  });
}

export async function enqueueFileTranslationsImportedActivity(
  input: FileActivityInput & { targetLocale: string },
) {
  const payload = filePayload(input);
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "file_translations_imported",
    organizationId: input.organizationId,
    payload: {
      ...payload,
      targetLocale: input.targetLocale,
    },
    targetId: fileActivityTargetId(input.projectId, payload.sourcePath),
    targetKind: "file",
  });
}

type SegmentActivityInput = ActivityActor & {
  itemCount?: number;
  organizationId: string;
  projectId: string;
  segmentId: string;
  sourcePath: string;
  targetLocale?: string | null;
};

export async function enqueueStringSegmentApprovedActivity(input: SegmentActivityInput) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "string_segment_approved",
    organizationId: input.organizationId,
    payload: segmentPayload(input),
    targetId: input.segmentId,
    targetKind: "string_segment",
  });
}

export async function enqueueStringSegmentStatusChangedActivity(
  input: SegmentActivityInput & { nextStatus: string; previousStatus?: string },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "string_segment_status_changed",
    organizationId: input.organizationId,
    payload: {
      ...segmentPayload(input),
      nextStatus: input.nextStatus,
      ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
    },
    targetId: input.segmentId,
    targetKind: "string_segment",
  });
}

export async function enqueueStringSegmentHiddenActivity(
  input: SegmentActivityInput & { isHidden: boolean },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: input.isHidden ? "string_segment_hidden" : "string_segment_unhidden",
    organizationId: input.organizationId,
    payload: segmentPayload(input),
    targetId: input.segmentId,
    targetKind: "string_segment",
  });
}

export async function enqueueStringSegmentLockedActivity(
  input: SegmentActivityInput & { isLocked: boolean },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: input.isLocked ? "string_segment_locked" : "string_segment_unlocked",
    organizationId: input.organizationId,
    payload: segmentPayload(input),
    targetId: input.segmentId,
    targetKind: "string_segment",
  });
}

export async function enqueueStringSegmentCommentedActivity(input: SegmentActivityInput) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "string_segment_commented",
    organizationId: input.organizationId,
    payload: segmentPayload(input),
    targetId: input.segmentId,
    targetKind: "string_segment",
  });
}

export function sessionActivityActor(userId: string | null | undefined): ActivityActor {
  return {
    actorCredentialId: null,
    actorKind: userId ? "user" : "system",
    actorUserId: userId ?? null,
  };
}

export function uploadActivityActor(input: {
  actorUserId?: string | null;
  uploadedByApiKeyId?: string | null;
  uploadedByUserId?: string | null;
}): ActivityActor {
  if (input.uploadedByApiKeyId) {
    return {
      actorCredentialId: input.uploadedByApiKeyId,
      actorKind: "api_key",
      actorUserId: input.actorUserId ?? input.uploadedByUserId ?? null,
    };
  }

  const userId = input.uploadedByUserId ?? input.actorUserId ?? null;
  return {
    actorCredentialId: null,
    actorKind: userId ? "user" : "system",
    actorUserId: userId,
  };
}
