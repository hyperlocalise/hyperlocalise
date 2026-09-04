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

export const ACTIVITY_ACTOR_KINDS = ["user", "system", "agent", "api_key"] as const;
export type ActivityActorKind = (typeof ACTIVITY_ACTOR_KINDS)[number];

export const ACTIVITY_TARGET_KINDS = [
  "organization",
  "invitation",
  "membership",
  "personal_access_token",
  "organization_api_key",
  "integration",
  "project",
  "glossary",
  "translation_memory",
] as const;
export type ActivityTargetKind = (typeof ACTIVITY_TARGET_KINDS)[number];

export const V1_ACTIVITY_EVENT_TYPES = [
  "member_invited",
  "member_invite_resent",
  "member_role_changed",
  "member_removed",
  "workspace_updated",
  "personal_access_token_created",
  "personal_access_token_revoked",
  "integration_connected",
  "integration_disconnected",
  "project_created",
  "project_deleted",
  "project_settings_changed",
  "glossary_created",
  "glossary_deleted",
  "glossary_imported",
  "glossary_exported",
  "glossary_project_attached",
  "glossary_project_detached",
  "translation_memory_created",
  "translation_memory_deleted",
  "translation_memory_imported",
  "translation_memory_exported",
  "translation_memory_project_attached",
  "translation_memory_project_detached",
] as const;
export type V1ActivityEventType = (typeof V1_ACTIVITY_EVENT_TYPES)[number];

/** Reserved until the data model distinguishes organization API keys from PATs. */
export const RESERVED_ACTIVITY_EVENT_TYPES = [
  "organization_api_key_created",
  "organization_api_key_revoked",
] as const;
export type ReservedActivityEventType = (typeof RESERVED_ACTIVITY_EVENT_TYPES)[number];

export const LATER_ACTIVITY_EVENT_TYPES = [
  "job_created",
  "job_cancelled",
  "job_failed",
  "automation_run_started",
  "automation_enabled",
  "automation_disabled",
] as const;
export type LaterActivityEventType = (typeof LATER_ACTIVITY_EVENT_TYPES)[number];

export type ActivityEventType =
  | V1ActivityEventType
  | ReservedActivityEventType
  | LaterActivityEventType;

export type ActivityMembershipRole =
  | "admin"
  | "localization_manager"
  | "developer"
  | "reviewer"
  | "translator"
  | "member";

type SafeResourcePayload = {
  resourceId: string;
  name?: string;
  source?: string;
  providerKind?: string;
};

type ImportExportPayload = {
  resourceId: string;
  batchId?: string;
  itemCount?: number;
  fileName?: string;
};

type AttachmentPayload = {
  projectId: string;
  resourceId: string;
};

export type ActivityPayloadByEventType = {
  member_invited: {
    invitationId: string;
    membershipId: string;
  };
  member_invite_resent: {
    invitationId: string;
  };
  member_role_changed: {
    memberUserId: string;
    membershipId: string;
    previousRole: ActivityMembershipRole;
    nextRole: ActivityMembershipRole;
  };
  member_removed: {
    memberUserId: string;
    membershipId: string;
  };
  workspace_updated: {
    changedFields: readonly string[];
    previousName?: string;
    nextName?: string;
  };
  personal_access_token_created: {
    keyPrefix: string;
    permissions: readonly string[];
    tokenId: string;
  };
  personal_access_token_revoked: {
    keyPrefix: string;
    reason: "manual" | "membership_removed";
    tokenId: string;
  };
  integration_connected: {
    connectionId: string;
    integrationKind: string;
  };
  integration_disconnected: {
    connectionId: string;
    integrationKind: string;
  };
  project_created: SafeResourcePayload;
  project_deleted: SafeResourcePayload;
  project_settings_changed: {
    changedFields: readonly string[];
    nextProviderKind?: string;
    nextVisibility?: string;
    previousProviderKind?: string;
    previousVisibility?: string;
    projectId: string;
  };
  glossary_created: SafeResourcePayload;
  glossary_deleted: SafeResourcePayload;
  glossary_imported: ImportExportPayload;
  glossary_exported: ImportExportPayload;
  glossary_project_attached: AttachmentPayload;
  glossary_project_detached: AttachmentPayload;
  translation_memory_created: SafeResourcePayload;
  translation_memory_deleted: SafeResourcePayload;
  translation_memory_imported: ImportExportPayload;
  translation_memory_exported: ImportExportPayload;
  translation_memory_project_attached: AttachmentPayload;
  translation_memory_project_detached: AttachmentPayload;
};

export type ActivityTargetKindByEventType = {
  member_invited: "invitation";
  member_invite_resent: "invitation";
  member_role_changed: "membership";
  member_removed: "membership";
  workspace_updated: "organization";
  personal_access_token_created: "personal_access_token";
  personal_access_token_revoked: "personal_access_token";
  integration_connected: "integration";
  integration_disconnected: "integration";
  project_created: "project";
  project_deleted: "project";
  project_settings_changed: "project";
  glossary_created: "glossary";
  glossary_deleted: "glossary";
  glossary_imported: "glossary";
  glossary_exported: "glossary";
  glossary_project_attached: "project";
  glossary_project_detached: "project";
  translation_memory_created: "translation_memory";
  translation_memory_deleted: "translation_memory";
  translation_memory_imported: "translation_memory";
  translation_memory_exported: "translation_memory";
  translation_memory_project_attached: "project";
  translation_memory_project_detached: "project";
};

type ActivityLogEventBase = {
  actorCredentialId: string | null;
  actorKind: ActivityActorKind;
  actorUserId: string | null;
  organizationId: string;
  targetId: string;
};

export type ActivityLogEventInput = {
  [EventType in V1ActivityEventType]: ActivityLogEventBase & {
    eventType: EventType;
    payload: ActivityPayloadByEventType[EventType];
    targetKind: ActivityTargetKindByEventType[EventType];
  };
}[V1ActivityEventType];

export type ActivityLogEventRecord = ActivityLogEventInput & {
  createdAt: Date;
  id: string;
};

export type ActivityLogWorkflowEvent = ActivityLogEventInput & {
  createdAt: string;
  id: string;
};

export type ActivityLogCursor = {
  createdAt: Date;
  id: string;
};

export type ActivityLogEnqueueError = { code: "activity_log_enqueue_failed" };

export const FORBIDDEN_ACTIVITY_PAYLOAD_KEYS = [
  "authorization",
  "body",
  "ciphertext",
  "email",
  "emailAddress",
  "fileBody",
  "fileContents",
  "hash",
  "keyHash",
  "key_hash",
  "prompt",
  "rawSecret",
  "rawToken",
  "requestBody",
  "request_body",
  "secret",
  "sourceText",
  "targetText",
  "token",
  "transcript",
  "x-api-key",
] as const;

const forbiddenActivityPayloadKeys = new Set<string>(FORBIDDEN_ACTIVITY_PAYLOAD_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects payload keys that could persist secrets or customer content. */
export function assertSafeActivityLogPayload(payload: unknown): void {
  if (!isRecord(payload)) {
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (forbiddenActivityPayloadKeys.has(key)) {
      throw new Error("activity_log_payload_contains_forbidden_field");
    }

    if (isRecord(value)) {
      assertSafeActivityLogPayload(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        assertSafeActivityLogPayload(item);
      }
    }
  }
}

export function isV1ActivityEventType(value: string): value is V1ActivityEventType {
  return (V1_ACTIVITY_EVENT_TYPES as readonly string[]).includes(value);
}
