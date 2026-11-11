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
import type { IssueNotificationType } from "@/lib/database/schema/issue-sheet";
import type { GoSvcInboxApi } from "@/lib/go-svc/go-svc-inbox-api";
import type { IssuePriority } from "@/lib/projects/issue-sheet/issue-list-constants";

export type InboxIssueNotification = {
  id: string;
  organizationId: string;
  projectId: string;
  issueId: string | null;
  qaRunId?: string | null;
  priority: IssuePriority | null;
  type: IssueNotificationType;
  payload: {
    issueTitle: string;
    projectId: string;
    errorCount?: number;
    errorsChange?: number;
    errorCode?: string | null;
    commentId?: string;
    commentExcerpt?: string;
    previousStatus?: string;
    nextStatus?: string;
    previousAssigneeUserId?: string | null;
    nextAssigneeUserId?: string | null;
  };
  actor: {
    userId: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
  } | null;
  readAt: string | null;
  createdAt: string;
};

export type InboxNotificationsApi = {
  list(
    organizationSlug: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number },
  ): Promise<{ notifications: InboxIssueNotification[]; total: number }>;
  unreadCount(organizationSlug: string): Promise<number>;
  markRead(
    organizationSlug: string,
    notificationId: string,
  ): Promise<{ id: string; readAt: string | null }>;
  markAllRead(organizationSlug: string): Promise<number>;
  getById(organizationSlug: string, notificationId: string): Promise<InboxIssueNotification>;
};

export function createInboxNotificationsApi(client: GoSvcInboxApi): InboxNotificationsApi {
  return {
    async list(organizationSlug, options = {}) {
      return client.listNotifications<InboxIssueNotification>(organizationSlug, {
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
        ...(options.unreadOnly ? { unreadOnly: true } : {}),
      });
    },

    async unreadCount(organizationSlug) {
      const body = await client.unreadCount(organizationSlug);
      return body.unreadCount;
    },

    async markRead(organizationSlug, notificationId) {
      const body = await client.markNotificationRead<{ id: string; readAt: string | null }>(
        organizationSlug,
        notificationId,
      );
      return body.notification;
    },

    async markAllRead(organizationSlug) {
      const body = await client.markAllNotificationsRead(organizationSlug);
      return body.markedCount;
    },

    async getById(organizationSlug, notificationId) {
      const body = await client.getNotification<InboxIssueNotification>(
        organizationSlug,
        notificationId,
      );
      return body.notification;
    },
  };
}

export function notificationsQueryKey(organizationSlug: string) {
  return ["issue-notifications", organizationSlug] as const;
}

export function notificationsUnreadCountQueryKey(organizationSlug: string) {
  return ["issue-notifications-unread-count", organizationSlug] as const;
}
