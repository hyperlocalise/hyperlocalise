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
import { readApiResponseError } from "@/lib/api-error";
import type { IssueNotificationType } from "@/lib/database/schema/issue-sheet";

export type InboxIssueNotification = {
  id: string;
  organizationId: string;
  projectId: string;
  issueId: string;
  type: IssueNotificationType;
  payload: {
    issueTitle: string;
    projectId: string;
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

function notificationsBase(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/notifications`;
}

export function createInboxNotificationsApi(): InboxNotificationsApi {
  return {
    async list(organizationSlug, options = {}) {
      const query = new URLSearchParams({
        limit: String(options.limit ?? 50),
        offset: String(options.offset ?? 0),
      });
      if (options.unreadOnly) {
        query.set("unreadOnly", "true");
      }
      const response = await fetch(`${notificationsBase(organizationSlug)}?${query.toString()}`);
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load notifications");
      }
      return (await response.json()) as {
        notifications: InboxIssueNotification[];
        total: number;
      };
    },

    async unreadCount(organizationSlug) {
      const response = await fetch(`${notificationsBase(organizationSlug)}/unread-count`);
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load unread notification count");
      }
      const body = (await response.json()) as { unreadCount: number };
      return body.unreadCount;
    },

    async markRead(organizationSlug, notificationId) {
      const response = await fetch(
        `${notificationsBase(organizationSlug)}/${encodeURIComponent(notificationId)}/read`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to mark notification as read");
      }
      const body = (await response.json()) as {
        notification: { id: string; readAt: string | null };
      };
      return body.notification;
    },

    async markAllRead(organizationSlug) {
      const response = await fetch(`${notificationsBase(organizationSlug)}/read-all`, {
        method: "POST",
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to mark all notifications as read");
      }
      const body = (await response.json()) as { markedCount: number };
      return body.markedCount;
    },

    async getById(organizationSlug, notificationId) {
      const response = await fetch(
        `${notificationsBase(organizationSlug)}/${encodeURIComponent(notificationId)}`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load notification");
      }
      const body = (await response.json()) as { notification: InboxIssueNotification };
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
