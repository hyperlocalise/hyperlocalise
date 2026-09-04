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
import Link from "next/link";
import { useIntl } from "react-intl";
import {
  BookOpenTextIcon,
  Building06Icon,
  FolderLibraryIcon,
  Key01Icon,
  PuzzleIcon,
  UserGroup02Icon,
  DatabaseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { V1ActivityEventType } from "@/lib/activity-log/activity-log-contract";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { activityLogsPageContentMessages as messages } from "./activity-logs-page-content.messages";

export type ActivityLogItem = {
  actor: { displayName: string; kind: string; userId: string | null };
  createdAt: string;
  eventType: V1ActivityEventType;
  id: string;
  payload: Record<string, unknown>;
  target: { displayName: string | null; href: string | null; kind: string };
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
};

type ActivityVisual = {
  className: string;
  icon: typeof UserGroup02Icon;
};

function activityVisual(eventType: V1ActivityEventType): ActivityVisual {
  if (eventType.startsWith("member_")) {
    return { icon: UserGroup02Icon, className: "bg-info/10 text-info" };
  }
  if (eventType === "workspace_updated") {
    return { icon: Building06Icon, className: "bg-primary/10 text-primary" };
  }
  if (eventType.startsWith("personal_access_token_")) {
    return { icon: Key01Icon, className: "bg-warning/10 text-warning" };
  }
  if (eventType.startsWith("integration_")) {
    return { icon: PuzzleIcon, className: "bg-success/10 text-success" };
  }
  if (eventType.startsWith("project_")) {
    return { icon: FolderLibraryIcon, className: "bg-primary/10 text-primary" };
  }
  if (eventType.startsWith("glossary_")) {
    return { icon: BookOpenTextIcon, className: "bg-warning/10 text-warning" };
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

export function ActivityLogList({
  activityLogs,
  now = Date.now(),
}: {
  activityLogs: ActivityLogItem[];
  now?: number;
}) {
  const intl = useIntl();

  return (
    <Card>
      <CardContent className="p-0">
        <ol className="divide-y divide-border">
          {activityLogs.map((item) => {
            const displayName = targetDisplayName(item);
            const target = displayName ? ` · ${displayName}` : "";
            const relative = relativeTime(item.createdAt, now);
            const visual = activityVisual(item.eventType);
            return (
              <li key={item.id} className="flex gap-3 px-4 py-4 md:px-6">
                <div
                  className={cn(
                    "grid size-8 shrink-0 place-content-center rounded-full",
                    visual.className,
                  )}
                  aria-hidden="true"
                >
                  <HugeiconsIcon icon={visual.icon} strokeWidth={1.8} />
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
                    {item.target.href && displayName ? (
                      <Link
                        className="underline underline-offset-2 hover:text-foreground"
                        href={item.target.href}
                      >
                        {displayName}
                      </Link>
                    ) : null}
                    <span title={new Date(item.createdAt).toLocaleString()}>
                      {new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
                        relative.value,
                        relative.unit,
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
