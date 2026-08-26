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
import type { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";

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

type ApiClient = ReturnType<typeof createApiClient>;

export function createInboxNotificationsApi(client: ApiClient): InboxNotificationsApi {
  const notifications = client.api.orgs[":organizationSlug"].notifications;

  return {
    async list(organizationSlug, options = {}) {
      const response = await notifications.$get({
        param: { organizationSlug },
        query: {
          limit: String(options.limit ?? 50),
          offset: String(options.offset ?? 0),
          ...(options.unreadOnly ? { unreadOnly: "true" } : {}),
        },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load notifications");
      }
      return response.json();
    },

    async unreadCount(organizationSlug) {
      const response = await notifications["unread-count"].$get({
        param: { organizationSlug },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load unread notification count");
      }
      const body = await response.json();
      return body.unreadCount;
    },

    async markRead(organizationSlug, notificationId) {
      const response = await notifications[":notificationId"].read.$post({
        param: { organizationSlug, notificationId },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to mark notification as read");
      }
      const body = await response.json();
      return body.notification;
    },

    async markAllRead(organizationSlug) {
      const response = await notifications["read-all"].$post({
        param: { organizationSlug },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to mark all notifications as read");
      }
      const body = await response.json();
      return body.markedCount;
    },

    async getById(organizationSlug, notificationId) {
      const response = await notifications[":notificationId"].$get({
        param: { organizationSlug, notificationId },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load notification");
      }
      const body = await response.json();
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
