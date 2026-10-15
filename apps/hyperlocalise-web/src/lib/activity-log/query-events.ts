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

import type { ActivityActorKind } from "./activity-log-contract";
import { enqueueActivityLogEvent } from "./activity-log-writer";

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

type QueryActivityInput = ActivityActor & {
  identifier: string;
  organizationId: string;
  projectId: string;
  queryId: string;
};

export async function enqueueQueryCreatedActivity(
  input: QueryActivityInput & { source: "manual" | "mcp" | "qa_promote" },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "query_created",
    organizationId: input.organizationId,
    payload: {
      identifier: input.identifier,
      name: input.identifier,
      projectId: input.projectId,
      queryId: input.queryId,
      source: input.source,
    },
    targetId: input.queryId,
    targetKind: "query",
  });
}

export async function enqueueQueryDeletedActivity(input: QueryActivityInput) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "query_deleted",
    organizationId: input.organizationId,
    payload: {
      identifier: input.identifier,
      name: input.identifier,
      projectId: input.projectId,
      queryId: input.queryId,
    },
    targetId: input.queryId,
    targetKind: "query",
  });
}

export async function enqueueQueryImportedActivity(
  input: ActivityActor & {
    itemCount: number;
    organizationId: string;
    projectId: string;
  },
) {
  return enqueueActivityLogEvent({
    ...activityActor(input),
    eventType: "query_imported",
    organizationId: input.organizationId,
    payload: {
      itemCount: input.itemCount,
      projectId: input.projectId,
    },
    targetId: input.projectId,
    targetKind: "project",
  });
}
