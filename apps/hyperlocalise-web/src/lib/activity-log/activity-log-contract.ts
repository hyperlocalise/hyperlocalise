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
  "job",
  "automation",
  "visual_workflow",
  "query",
  "file",
  "string_segment",
  "dictionary",
  "linked_domain",
] as const;
export type ActivityTargetKind = (typeof ACTIVITY_TARGET_KINDS)[number];

export const V1_ACTIVITY_EVENT_TYPES = [
  "member_invited",
  "member_invite_resent",
  "member_invite_revoked",
  "member_joined",
  "member_role_changed",
  "member_removed",
  "workspace_updated",
  "workspace_archived",
  "personal_access_token_created",
  "personal_access_token_revoked",
  "integration_connected",
  "integration_disconnected",
  "integration_credential_revealed",
  "integration_credential_rotated",
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
  "translation_memory_action_rejected",
] as const;
export type V1ActivityEventType = (typeof V1_ACTIVITY_EVENT_TYPES)[number];

export const ORGANIZATION_API_KEY_ACTIVITY_EVENT_TYPES = [
  "organization_api_key_created",
  "organization_api_key_revoked",
] as const;
export type OrganizationApiKeyActivityEventType =
  (typeof ORGANIZATION_API_KEY_ACTIVITY_EVENT_TYPES)[number];

export const LATER_ACTIVITY_EVENT_TYPES = [
  "job_created",
  "job_cancelled",
  "job_failed",
  "automation_created",
  "automation_deleted",
  "automation_run_started",
  "automation_enabled",
  "automation_disabled",
] as const;
export type LaterActivityEventType = (typeof LATER_ACTIVITY_EVENT_TYPES)[number];

export const VISUAL_WORKFLOW_ACTIVITY_EVENT_TYPES = [
  "visual_workflow_created",
  "visual_workflow_deleted",
  "visual_workflow_published",
  "visual_workflow_enabled",
  "visual_workflow_disabled",
  "visual_workflow_run_started",
] as const;
export type VisualWorkflowActivityEventType = (typeof VISUAL_WORKFLOW_ACTIVITY_EVENT_TYPES)[number];

export const QUERY_ACTIVITY_EVENT_TYPES = [
  "query_created",
  "query_deleted",
  "query_imported",
] as const;
export type QueryActivityEventType = (typeof QUERY_ACTIVITY_EVENT_TYPES)[number];

export const DICTIONARY_ACTIVITY_EVENT_TYPES = [
  "dictionary_created",
  "dictionary_deleted",
  "dictionary_imported",
  "dictionary_project_attached",
] as const;
export type DictionaryActivityEventType = (typeof DICTIONARY_ACTIVITY_EVENT_TYPES)[number];

export const LINKED_DOMAIN_ACTIVITY_EVENT_TYPES = [
  "linked_domain_created",
  "linked_domain_verified",
  "linked_domain_cancelled",
  "linked_domain_markets_changed",
] as const;
export type LinkedDomainActivityEventType = (typeof LINKED_DOMAIN_ACTIVITY_EVENT_TYPES)[number];

export const FILE_SEGMENT_ACTIVITY_EVENT_TYPES = [
  "file_uploaded",
  "file_translations_imported",
  "string_segment_translation_updated",
  "string_segment_approved",
  "string_segment_status_changed",
  "string_segment_hidden",
  "string_segment_unhidden",
  "string_segment_locked",
  "string_segment_unlocked",
  "string_segment_commented",
] as const;
export type FileSegmentActivityEventType = (typeof FILE_SEGMENT_ACTIVITY_EVENT_TYPES)[number];

export const IMPLEMENTED_ACTIVITY_EVENT_TYPES = [
  ...V1_ACTIVITY_EVENT_TYPES,
  ...ORGANIZATION_API_KEY_ACTIVITY_EVENT_TYPES,
  ...LATER_ACTIVITY_EVENT_TYPES,
  ...VISUAL_WORKFLOW_ACTIVITY_EVENT_TYPES,
  ...QUERY_ACTIVITY_EVENT_TYPES,
  ...FILE_SEGMENT_ACTIVITY_EVENT_TYPES,
  ...DICTIONARY_ACTIVITY_EVENT_TYPES,
  ...LINKED_DOMAIN_ACTIVITY_EVENT_TYPES,
] as const;
export type ImplementedActivityEventType = (typeof IMPLEMENTED_ACTIVITY_EVENT_TYPES)[number];

export type ActivityEventType =
  | V1ActivityEventType
  | OrganizationApiKeyActivityEventType
  | LaterActivityEventType
  | VisualWorkflowActivityEventType
  | QueryActivityEventType
  | FileSegmentActivityEventType
  | DictionaryActivityEventType
  | LinkedDomainActivityEventType;

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

type FileActivityPayload = {
  fileName: string;
  name: string;
  projectId: string;
  sourcePath: string;
  storedFileId?: string;
  versionId?: string;
};

type StringSegmentActivityPayload = {
  fileName: string;
  itemCount?: number;
  name: string;
  projectId: string;
  segmentId: string;
  sourcePath: string;
  targetLocale?: string;
};

export type ActivityPayloadByEventType = {
  member_invited: {
    invitationId: string;
    membershipId: string;
  };
  member_invite_resent: {
    invitationId: string;
  };
  member_invite_revoked: {
    invitationId: string;
  };
  member_joined: {
    memberUserId: string;
    membershipId: string;
    role: ActivityMembershipRole;
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
  workspace_archived: {
    lifecycleStatus: "archived";
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
  organization_api_key_created: {
    apiKeyId: string;
    keyPrefix: string;
    name: string;
    permissions: readonly string[];
  };
  organization_api_key_revoked: {
    apiKeyId: string;
    keyPrefix: string;
    name: string;
    reason: "manual" | "membership_removed";
  };
  integration_connected: {
    connectionId: string;
    integrationKind: string;
  };
  integration_disconnected: {
    connectionId: string;
    integrationKind: string;
  };
  integration_credential_revealed: {
    connectionId: string;
    integrationKind: string;
  };
  integration_credential_rotated: {
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
  translation_memory_action_rejected: {
    action: string;
    reason: string;
    resourceId: string;
  };
  job_created: {
    jobId: string;
    kind: string;
    projectId?: string;
    status: string;
  };
  job_cancelled: {
    jobId: string;
    kind: string;
    projectId?: string;
    status: "cancelled";
  };
  job_failed: {
    errorCode: string;
    jobId: string;
    kind: string;
    projectId?: string;
    status: "failed";
  };
  automation_created: {
    automationId: string;
    name: string;
    status: "active" | "archived" | "paused";
  };
  automation_deleted: {
    automationId: string;
    name: string;
    status: "archived";
  };
  automation_run_started: {
    automationId: string;
    name: string;
    runId: string;
    status: "running";
    triggerSource: string;
  };
  automation_enabled: {
    automationId: string;
    name: string;
    status: "active";
  };
  automation_disabled: {
    automationId: string;
    name: string;
    status: "archived" | "paused";
  };
  visual_workflow_created: {
    name: string;
    status: "draft";
    visualWorkflowId: string;
  };
  visual_workflow_deleted: {
    name: string;
    status: "archived";
    visualWorkflowId: string;
  };
  visual_workflow_published: {
    name: string;
    publishedVersion: number;
    visualWorkflowId: string;
  };
  visual_workflow_enabled: {
    name: string;
    status: "active";
    visualWorkflowId: string;
  };
  visual_workflow_disabled: {
    name: string;
    status: "archived" | "paused";
    visualWorkflowId: string;
  };
  visual_workflow_run_started: {
    name: string;
    runId: string;
    status: "queued";
    triggerSource: string;
    visualWorkflowId: string;
  };
  query_created: {
    identifier: string;
    name: string;
    projectId: string;
    queryId: string;
    source: "manual" | "mcp" | "qa_promote";
  };
  query_deleted: {
    identifier: string;
    name: string;
    projectId: string;
    queryId: string;
  };
  query_imported: {
    itemCount: number;
    projectId: string;
  };
  file_uploaded: FileActivityPayload;
  file_translations_imported: FileActivityPayload & {
    targetLocale: string;
  };
  string_segment_translation_updated: StringSegmentActivityPayload & {
    afterRevision?: string;
    beforeRevision?: string;
    beforeStatus?: string;
    groupId?: string;
    nextStatus?: string;
    operationId?: string;
    operationMemberIds?: string[];
    sourceRevision?: string;
  };
  string_segment_approved: StringSegmentActivityPayload;
  string_segment_status_changed: StringSegmentActivityPayload & {
    nextStatus: string;
    previousStatus?: string;
  };
  string_segment_hidden: StringSegmentActivityPayload;
  string_segment_unhidden: StringSegmentActivityPayload;
  string_segment_locked: StringSegmentActivityPayload;
  string_segment_unlocked: StringSegmentActivityPayload;
  string_segment_commented: StringSegmentActivityPayload;
  dictionary_created: SafeResourcePayload;
  dictionary_deleted: SafeResourcePayload;
  dictionary_imported: ImportExportPayload & {
    locale?: string;
  };
  dictionary_project_attached: AttachmentPayload;
  linked_domain_created: {
    name: string;
    resourceId: string;
    status: string;
  };
  linked_domain_verified: {
    name: string;
    resourceId: string;
    status: string;
    verifiedMethod?: string;
  };
  linked_domain_cancelled: {
    name: string;
    resourceId: string;
    status: "cancelled";
  };
  linked_domain_markets_changed: {
    name: string;
    nextMarketIds: readonly string[];
    previousMarketIds: readonly string[];
    resourceId: string;
  };
};

export type ActivityTargetKindByEventType = {
  member_invited: "invitation";
  member_invite_resent: "invitation";
  member_invite_revoked: "invitation";
  member_joined: "membership";
  member_role_changed: "membership";
  member_removed: "membership";
  workspace_updated: "organization";
  workspace_archived: "organization";
  personal_access_token_created: "personal_access_token";
  personal_access_token_revoked: "personal_access_token";
  organization_api_key_created: "organization_api_key";
  organization_api_key_revoked: "organization_api_key";
  integration_connected: "integration";
  integration_disconnected: "integration";
  integration_credential_revealed: "integration";
  integration_credential_rotated: "integration";
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
  translation_memory_action_rejected: "translation_memory";
  job_created: "job";
  job_cancelled: "job";
  job_failed: "job";
  automation_created: "automation";
  automation_deleted: "automation";
  automation_run_started: "automation";
  automation_enabled: "automation";
  automation_disabled: "automation";
  visual_workflow_created: "visual_workflow";
  visual_workflow_deleted: "visual_workflow";
  visual_workflow_published: "visual_workflow";
  visual_workflow_enabled: "visual_workflow";
  visual_workflow_disabled: "visual_workflow";
  visual_workflow_run_started: "visual_workflow";
  query_created: "query";
  query_deleted: "query";
  query_imported: "project";
  file_uploaded: "file";
  file_translations_imported: "file";
  string_segment_translation_updated: "string_segment";
  string_segment_approved: "string_segment";
  string_segment_status_changed: "string_segment";
  string_segment_hidden: "string_segment";
  string_segment_unhidden: "string_segment";
  string_segment_locked: "string_segment";
  string_segment_unlocked: "string_segment";
  string_segment_commented: "string_segment";
  dictionary_created: "dictionary";
  dictionary_deleted: "dictionary";
  dictionary_imported: "dictionary";
  dictionary_project_attached: "project";
  linked_domain_created: "linked_domain";
  linked_domain_verified: "linked_domain";
  linked_domain_cancelled: "linked_domain";
  linked_domain_markets_changed: "linked_domain";
};

type ActivityLogEventBase = {
  actorCredentialId: string | null;
  actorKind: ActivityActorKind;
  actorUserId: string | null;
  organizationId: string;
  targetId: string;
};

export type ActivityLogEventInput = {
  [EventType in ImplementedActivityEventType]: ActivityLogEventBase & {
    eventType: EventType;
    payload: ActivityPayloadByEventType[EventType];
    targetKind: ActivityTargetKindByEventType[EventType];
  };
}[ImplementedActivityEventType];

export type ActivityLogEventRecord = ActivityLogEventInput & {
  createdAt: Date;
  id: string;
};

export type ActivityLogWorkflowEvent = ActivityLogEventInput & {
  createdAt: string;
  id: string;
};

export const ACTIVITY_LOG_SQS_SCHEMA_VERSION = 1 as const;

export type ActivityLogSqsMessage = {
  event: ActivityLogWorkflowEvent;
  messageType: "activity_log";
  schemaVersion: typeof ACTIVITY_LOG_SQS_SCHEMA_VERSION;
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
  "beforeText",
  "afterText",
  "groupSourceText",
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
