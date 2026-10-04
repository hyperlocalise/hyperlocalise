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

import { enqueueActivityLogEvent } from "./activity-log-writer";
import type { ActivityActor } from "./file-segment-events";

type IntegrationActivityInput = ActivityActor & {
  connectionId: string;
  integrationKind: string;
  organizationId: string;
};

function integrationPayload(input: IntegrationActivityInput) {
  return {
    connectionId: input.connectionId,
    integrationKind: input.integrationKind,
  };
}

export async function enqueueIntegrationConnectedActivity(input: IntegrationActivityInput) {
  return enqueueActivityLogEvent({
    actorCredentialId: input.actorCredentialId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
    eventType: "integration_connected",
    organizationId: input.organizationId,
    payload: integrationPayload(input),
    targetId: input.connectionId,
    targetKind: "integration",
  });
}

export async function enqueueIntegrationDisconnectedActivity(input: IntegrationActivityInput) {
  return enqueueActivityLogEvent({
    actorCredentialId: input.actorCredentialId,
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
    eventType: "integration_disconnected",
    organizationId: input.organizationId,
    payload: integrationPayload(input),
    targetId: input.connectionId,
    targetKind: "integration",
  });
}
