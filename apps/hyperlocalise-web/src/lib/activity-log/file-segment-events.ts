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

import path from "node:path";

import type {
  ActivityActorKind,
  ContentEditorActivityEventType,
  FileActivityPayload,
  SegmentActivityPayload,
} from "./activity-log-contract";
import { fileActivityTargetId, segmentActivityTargetId } from "./activity-log-ids";
import { enqueueActivityLogEvent, enqueueActivityLogEvents } from "./activity-log-writer";

export { fileActivityTargetId, segmentActivityTargetId };

type ActivityActor = {
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

export function safeFileActivityName(sourcePath: string): string {
  const basename = path.posix.basename(sourcePath.trim()) || sourcePath.trim();
  return basename.slice(0, 256);
}

export function safeSegmentActivityName(stringKey: string | null | undefined): string {
  const trimmed = stringKey?.trim() ?? "";
  return (trimmed || "string").slice(0, 256);
}

type FileActivityInput = ActivityActor & {
  format?: string;
  itemCount?: number;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale?: string;
};

function filePayload(input: FileActivityInput): FileActivityPayload {
  return {
    name: safeFileActivityName(input.sourcePath),
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    ...(input.format ? { format: input.format } : {}),
    ...(input.itemCount != null ? { itemCount: input.itemCount } : {}),
    ...(input.targetLocale ? { targetLocale: input.targetLocale } : {}),
  };
}

export async function enqueueFileActivity(
  eventType: Extract<ContentEditorActivityEventType, `file_${string}`>,
  input: FileActivityInput,
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType,
    organizationId: input.organizationId,
    payload: filePayload(input),
    targetId: fileActivityTargetId(input.projectId, input.sourcePath),
    targetKind: "file",
  });
}

type SegmentActivityInput = ActivityActor & {
  externalStringId: string;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  stringKey?: string | null;
  targetLocale?: string;
};

function segmentPayload(input: SegmentActivityInput): SegmentActivityPayload {
  return {
    externalStringId: input.externalStringId,
    name: safeSegmentActivityName(input.stringKey ?? input.externalStringId),
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    ...(input.targetLocale ? { targetLocale: input.targetLocale } : {}),
  };
}

export async function enqueueSegmentActivity(
  eventType: Extract<ContentEditorActivityEventType, `segment_${string}`>,
  input: SegmentActivityInput,
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType,
    organizationId: input.organizationId,
    payload: segmentPayload(input),
    targetId: segmentActivityTargetId(input.projectId, input.externalStringId),
    targetKind: "segment",
  });
}

export async function enqueueSegmentActivities(
  eventType: Extract<ContentEditorActivityEventType, `segment_${string}`>,
  inputs: SegmentActivityInput[],
) {
  return enqueueActivityLogEvents(
    inputs.map((input) => ({
      ...activityActor(input),
      eventType,
      organizationId: input.organizationId,
      payload: segmentPayload(input),
      targetId: segmentActivityTargetId(input.projectId, input.externalStringId),
      targetKind: "segment" as const,
    })),
  );
}
