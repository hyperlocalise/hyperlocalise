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
import type { UserNotificationPreferences } from "@/lib/notifications/user-notification-preferences";

import type { GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export type GoSvcMentionSuggestions = {
  users: Array<{
    userId: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  }>;
  issues: Array<{
    issueId: string;
    projectId: string;
    displayKey: string;
    title: string;
    status: string;
  }>;
};

export class GoSvcInboxApi {
  constructor(private readonly request: GoSvcRequest) {}

  listNotifications<T>(
    organizationSlug: string,
    query: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ notifications: T[]; total: number }>(
      orgPath(organizationSlug, "notifications"),
      { query, ...options },
    );
  }

  unreadCount(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ unreadCount: number }>(
      orgPath(organizationSlug, "notifications", "unread-count"),
      options,
    );
  }

  getNotification<T>(
    organizationSlug: string,
    notificationId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ notification: T }>(
      orgPath(organizationSlug, "notifications", notificationId),
      options,
    );
  }

  markNotificationRead<T>(
    organizationSlug: string,
    notificationId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ notification: T }>(
      orgPath(organizationSlug, "notifications", notificationId, "read"),
      { method: "POST", ...options },
    );
  }

  markAllNotificationsRead(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ markedCount: number }>(
      orgPath(organizationSlug, "notifications", "read-all"),
      { method: "POST", ...options },
    );
  }

  getPreferences(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ preferences: UserNotificationPreferences }>(
      orgPath(organizationSlug, "notification-preferences"),
      options,
    );
  }

  updatePreferences(
    organizationSlug: string,
    body: UserNotificationPreferences,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ preferences: UserNotificationPreferences }>(
      orgPath(organizationSlug, "notification-preferences"),
      { method: "PUT", body, ...options },
    );
  }

  mentions(
    organizationSlug: string,
    query: { q: string; projectId?: string; issueId?: string; limit?: number },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ mentionSuggestions: GoSvcMentionSuggestions }>(
      orgPath(organizationSlug, "mentions"),
      { query, ...options },
    );
  }
}
