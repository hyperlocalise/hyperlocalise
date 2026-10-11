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
import type { ActivityActorKind, ActivityLogEventInput } from "./activity-log-contract";

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

type OrganizationApiKeyActivityInput = ActivityActor & {
  apiKeyId: string;
  keyPrefix: string;
  name: string;
  organizationId: string;
};

export function organizationApiKeyCreatedActivity(
  input: OrganizationApiKeyActivityInput & { permissions: readonly string[] },
): Extract<ActivityLogEventInput, { eventType: "organization_api_key_created" }> {
  return {
    ...activityActor(input),
    eventType: "organization_api_key_created",
    organizationId: input.organizationId,
    payload: {
      apiKeyId: input.apiKeyId,
      keyPrefix: input.keyPrefix,
      name: input.name,
      permissions: input.permissions,
    },
    targetId: input.apiKeyId,
    targetKind: "organization_api_key",
  };
}

export function organizationApiKeyRevokedActivity(
  input: OrganizationApiKeyActivityInput & { reason: "manual" | "membership_removed" },
): Extract<ActivityLogEventInput, { eventType: "organization_api_key_revoked" }> {
  return {
    ...activityActor(input),
    eventType: "organization_api_key_revoked",
    organizationId: input.organizationId,
    payload: {
      apiKeyId: input.apiKeyId,
      keyPrefix: input.keyPrefix,
      name: input.name,
      reason: input.reason,
    },
    targetId: input.apiKeyId,
    targetKind: "organization_api_key",
  };
}
