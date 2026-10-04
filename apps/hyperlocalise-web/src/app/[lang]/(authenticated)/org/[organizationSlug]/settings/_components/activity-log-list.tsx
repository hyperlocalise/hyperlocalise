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
import { createElement } from "react";
import Link from "next/link";
import { useIntl, type MessageDescriptor } from "react-intl";
import {
  BookOpenTextIcon,
  BuildingOfficeIcon,
  FoldersIcon,
  KeyIcon,
  PuzzlePieceIcon,
  UsersThreeIcon,
  DatabaseIcon,
  FileIcon,
  TextTIcon,
} from "@phosphor-icons/react";

import type { ImplementedActivityEventType } from "@/lib/activity-log/activity-log-contract";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { activityLogsPageContentMessages as messages } from "./activity-logs-page-content.messages";

export type ActivityLogActor = {
  credentialId: string | null;
  credentialName?: string | null;
  displayName: string;
  keyPrefix?: string | null;
  kind: string;
  userId: string | null;
};

export type ActivityLogItem = {
  actor: ActivityLogActor;
  createdAt: string;
  eventType: ImplementedActivityEventType;
  id: string;
  payload: Record<string, unknown>;
  target: { displayName: string | null; href: string | null; id?: string; kind: string };
};

const eventActions = {
  member_invited: messages.memberInvitedAction,
  member_invite_resent: messages.memberInviteResentAction,
  member_role_changed: messages.memberRoleChangedAction,
  member_removed: messages.memberRemovedAction,
  workspace_updated: messages.workspaceUpdatedAction,
  personal_access_token_created: messages.personalAccessTokenCreatedAction,
  personal_access_token_revoked: messages.personalAccessTokenRevokedAction,
  integration_connected: messages.integrationConnectedAction,
  integration_disconnected: messages.integrationDisconnectedAction,
  project_created: messages.projectCreatedAction,
  project_deleted: messages.projectDeletedAction,
  project_settings_changed: messages.projectSettingsChangedAction,
  glossary_created: messages.glossaryCreatedAction,
  glossary_deleted: messages.glossaryDeletedAction,
  glossary_imported: messages.glossaryImportedAction,
  glossary_exported: messages.glossaryExportedAction,
  glossary_project_attached: messages.glossaryProjectAttachedAction,
  glossary_project_detached: messages.glossaryProjectDetachedAction,
  translation_memory_created: messages.translationMemoryCreatedAction,
  translation_memory_deleted: messages.translationMemoryDeletedAction,
  translation_memory_imported: messages.translationMemoryImportedAction,
  translation_memory_exported: messages.translationMemoryExportedAction,
  translation_memory_project_attached: messages.translationMemoryProjectAttachedAction,
  translation_memory_project_detached: messages.translationMemoryProjectDetachedAction,
  translation_memory_action_rejected: messages.translationMemoryActionRejectedAction,
  job_created: messages.jobCreatedAction,
  job_cancelled: messages.jobCancelledAction,
  job_failed: messages.jobFailedAction,
  automation_run_started: messages.automationRunStartedAction,
  automation_enabled: messages.automationEnabledAction,
  automation_disabled: messages.automationDisabledAction,
  file_uploaded: messages.fileUploadedAction,
  file_translations_imported: messages.fileTranslationsImportedAction,
  string_segment_translation_updated: messages.stringSegmentTranslationUpdatedAction,
  string_segment_approved: messages.stringSegmentApprovedAction,
  string_segment_status_changed: messages.stringSegmentStatusChangedAction,
  string_segment_hidden: messages.stringSegmentHiddenAction,
  string_segment_unhidden: messages.stringSegmentUnhiddenAction,
  string_segment_locked: messages.stringSegmentLockedAction,
  string_segment_unlocked: messages.stringSegmentUnlockedAction,
  string_segment_commented: messages.stringSegmentCommentedAction,
} satisfies Record<ImplementedActivityEventType, MessageDescriptor>;

export const activityLogEventActions = eventActions;

type ActivityVisual = {
  className: string;
  icon: typeof UsersThreeIcon;
};

function activityVisual(eventType: ImplementedActivityEventType): ActivityVisual {
  if (eventType.startsWith("member_")) {
    return { icon: UsersThreeIcon, className: "bg-info/10 text-info" };
  }
  if (eventType === "workspace_updated") {
    return { icon: BuildingOfficeIcon, className: "bg-primary/10 text-primary" };
  }
  if (eventType.startsWith("personal_access_token_")) {
    return { icon: KeyIcon, className: "bg-warning/10 text-warning" };
  }
  if (eventType.startsWith("integration_")) {
    return { icon: PuzzlePieceIcon, className: "bg-success/10 text-success" };
  }
  if (eventType.startsWith("project_")) {
    return { icon: FoldersIcon, className: "bg-primary/10 text-primary" };
  }
  if (eventType.startsWith("glossary_")) {
    return { icon: BookOpenTextIcon, className: "bg-warning/10 text-warning" };
  }
  if (eventType.startsWith("automation_")) {
    return { icon: PuzzlePieceIcon, className: "bg-success/10 text-success" };
  }
  if (eventType.startsWith("file_")) {
    return { icon: FileIcon, className: "bg-primary/10 text-primary" };
  }
  if (eventType.startsWith("string_segment_")) {
    return { icon: TextTIcon, className: "bg-warning/10 text-warning" };
  }
  return { icon: DatabaseIcon, className: "bg-info/10 text-info" };
}

function relativeTime(
  date: string,
  now: number,
): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) return { value: seconds, unit: "second" };
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return { value: minutes, unit: "minute" };
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return { value: hours, unit: "hour" };
  return { value: Math.round(hours / 24), unit: "day" };
}

function targetDisplayName(item: ActivityLogItem): string | null {
  if (item.target.displayName) return item.target.displayName;
  if (
    (item.eventType === "integration_connected" || item.eventType === "integration_disconnected") &&
    typeof item.payload.integrationKind === "string"
  ) {
    return item.payload.integrationKind;
  }
  if (
    (item.eventType === "personal_access_token_created" ||
      item.eventType === "personal_access_token_revoked") &&
    typeof item.payload.keyPrefix === "string"
  ) {
    return item.payload.keyPrefix;
  }
  return null;
}

function userFilterValue(actor: ActivityLogActor): string | null {
  if (actor.userId) {
    return `user:${actor.userId}`;
  }
  if (actor.kind === "system" || actor.kind === "agent") {
    return actor.kind;
  }
  return null;
}

function apiKeyLabel(actor: ActivityLogActor): string | null {
  if (actor.kind !== "api_key" && !actor.credentialId) {
    return null;
  }
  return actor.credentialName || actor.keyPrefix || actor.credentialId;
}

function payloadEntries(payload: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(payload).flatMap(([key, value]) => {
    if (value == null || value === "") {
      return [];
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return [[key, String(value)]];
    }
    if (Array.isArray(value) && value.every((item) => typeof item !== "object")) {
      return [[key, value.map(String).join(", ")]];
    }
    return [];
  });
}

export function ActivityLogList({
  activityLogs,
  now = Date.now(),
  onActorFilter,
  organizationSlug,
  variant = "card",
}: {
  activityLogs: ActivityLogItem[];
  now?: number;
  onActorFilter?: (value: string) => void;
  organizationSlug?: string;
  variant?: "card" | "plain";
}) {
  const intl = useIntl();

  const list = (
    <ol className="divide-y divide-border">
      {activityLogs.map((item) => {
        const displayName = targetDisplayName(item);
        const target = displayName ? ` · ${displayName}` : "";
        const relative = relativeTime(item.createdAt, now);
        const visual = activityVisual(item.eventType);
        const userFilter = userFilterValue(item.actor);
        const keyLabel = apiKeyLabel(item.actor);
        const occurredAt = new Date(item.createdAt).toLocaleString();
        const details = payloadEntries(item.payload);
        return (
          <li
            key={item.id}
            className={cn("flex gap-3", variant === "plain" ? "px-1 py-3" : "px-4 py-4 md:px-6")}
          >
            <div
              className={cn(
                "grid size-8 shrink-0 place-content-center rounded-full",
                visual.className,
              )}
              aria-hidden="true"
            >
              {createElement(visual.icon, {})}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <TypographyP size="small" weight="medium" tone="content">
                  {intl.formatMessage(messages.eventDescription, {
                    actor: item.actor.displayName,
                    action: intl.formatMessage(eventActions[item.eventType]),
                    target,
                  })}
                </TypographyP>
                <Badge variant="outline">{item.actor.kind}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {userFilter && onActorFilter ? (
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => onActorFilter(userFilter)}
                    aria-label={intl.formatMessage(messages.filterByActor, {
                      name: item.actor.displayName,
                    })}
                  >
                    {item.actor.displayName}
                  </button>
                ) : null}
                {keyLabel ? (
                  item.actor.credentialId && onActorFilter ? (
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => onActorFilter(`api_key:${item.actor.credentialId}`)}
                      aria-label={intl.formatMessage(messages.filterByApiKey, { name: keyLabel })}
                    >
                      {item.actor.keyPrefix
                        ? intl.formatMessage(messages.viaApiKeyWithPrefix, {
                            name: item.actor.credentialName || keyLabel,
                            prefix: item.actor.keyPrefix,
                          })
                        : intl.formatMessage(messages.viaApiKey, { name: keyLabel })}
                    </button>
                  ) : (
                    <span>
                      {item.actor.keyPrefix
                        ? intl.formatMessage(messages.viaApiKeyWithPrefix, {
                            name: item.actor.credentialName || keyLabel,
                            prefix: item.actor.keyPrefix,
                          })
                        : intl.formatMessage(messages.viaApiKey, { name: keyLabel })}
                    </span>
                  )
                ) : null}
                {item.target.href && displayName ? (
                  <Link
                    className="underline underline-offset-2 hover:text-foreground"
                    href={item.target.href}
                  >
                    {displayName}
                  </Link>
                ) : null}
                {organizationSlug && item.actor.userId ? (
                  <Link
                    className="underline underline-offset-2 hover:text-foreground"
                    href={`/org/${organizationSlug}/settings/members`}
                  >
                    {intl.formatMessage(messages.viewMember)}
                  </Link>
                ) : null}
                {organizationSlug && item.actor.credentialId ? (
                  <Link
                    className="underline underline-offset-2 hover:text-foreground"
                    href={`/org/${organizationSlug}/settings/api-keys`}
                  >
                    {intl.formatMessage(messages.viewApiKeys)}
                  </Link>
                ) : null}
                <span title={occurredAt}>
                  {new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
                    relative.value,
                    relative.unit,
                  )}
                </span>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {intl.formatMessage(messages.showDetails)}
                </summary>
                <dl
                  className="mt-2 grid gap-1 text-xs text-muted-foreground"
                  aria-label={intl.formatMessage(messages.detailsLabel)}
                >
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {intl.formatMessage(messages.actorKindDetail)}
                    </dt>
                    {": "}
                    <dd className="inline font-mono">{item.actor.kind}</dd>
                  </div>
                  {item.actor.userId ? (
                    <div>
                      <dt className="inline font-medium text-foreground">
                        {intl.formatMessage(messages.userIdDetail)}
                      </dt>
                      {": "}
                      <dd className="inline font-mono">{item.actor.userId}</dd>
                    </div>
                  ) : null}
                  {item.actor.credentialId ? (
                    <div>
                      <dt className="inline font-medium text-foreground">
                        {intl.formatMessage(messages.credentialIdDetail)}
                      </dt>
                      {": "}
                      <dd className="inline font-mono">{item.actor.credentialId}</dd>
                    </div>
                  ) : null}
                  {item.actor.credentialName ? (
                    <div>
                      <dt className="inline font-medium text-foreground">
                        {intl.formatMessage(messages.credentialNameDetail)}
                      </dt>
                      {": "}
                      <dd className="inline">{item.actor.credentialName}</dd>
                    </div>
                  ) : null}
                  {item.actor.keyPrefix ? (
                    <div>
                      <dt className="inline font-medium text-foreground">
                        {intl.formatMessage(messages.keyPrefixDetail)}
                      </dt>
                      {": "}
                      <dd className="inline font-mono">{item.actor.keyPrefix}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {intl.formatMessage(messages.eventTypeDetail)}
                    </dt>
                    {": "}
                    <dd className="inline font-mono">{item.eventType}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {intl.formatMessage(messages.targetKindDetail)}
                    </dt>
                    {": "}
                    <dd className="inline font-mono">{item.target.kind}</dd>
                  </div>
                  {item.target.id ? (
                    <div>
                      <dt className="inline font-medium text-foreground">
                        {intl.formatMessage(messages.targetIdDetail)}
                      </dt>
                      {": "}
                      <dd className="inline font-mono">{item.target.id}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {intl.formatMessage(messages.occurredAtDetail)}
                    </dt>
                    {": "}
                    <dd className="inline">{occurredAt}</dd>
                  </div>
                  {details.length > 0 ? (
                    <div>
                      <dt className="font-medium text-foreground">
                        {intl.formatMessage(messages.payloadDetail)}
                      </dt>
                      <dd>
                        <ul className="mt-1 space-y-0.5">
                          {details.map(([key, value]) => (
                            <li key={key}>
                              <span className="font-mono">{key}</span>
                              {": "}
                              {value}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            </div>
          </li>
        );
      })}
    </ol>
  );

  if (variant === "plain") {
    return list;
  }

  return (
    <Card>
      <CardContent className="p-0">{list}</CardContent>
    </Card>
  );
}
