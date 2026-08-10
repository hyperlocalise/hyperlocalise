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
import type { EmailNotificationItem } from "./issue-inbox-notifications-email";

export const emailStoryBrandLogoUrl = "/images/logo.png";
export const emailStoryInboxUrl = "https://app.hyperlocalise.com/en/org/acme/inbox";
export const emailStoryUnsubscribeUrl =
  "https://app.hyperlocalise.com/en/org/acme/settings/account#notifications";

const issueA = {
  issueId: "issue_trip_1421",
  issueTitle: "TM - Enhance Messaging feature",
  issueLabel: "TRIP-1421",
};

const issueB = {
  issueId: "issue_trip_1502",
  issueTitle: "Fix glossary import timeout",
  issueLabel: "TRIP-1502",
};

export const commentNotification: EmailNotificationItem = {
  id: "notif_comment_1",
  type: "comment",
  ...issueA,
  actorName: "hans",
  actorInitials: "HB",
  actionHref: `${emailStoryInboxUrl}/notifications/notif_comment_1`,
  excerpt: "Jules PR",
};

export const assignedNotification: EmailNotificationItem = {
  id: "notif_assigned_1",
  type: "assigned",
  ...issueA,
  actorName: "hans",
  actorInitials: "HB",
  actionHref: `${emailStoryInboxUrl}/notifications/notif_assigned_1`,
};

export const mentionNotification: EmailNotificationItem = {
  id: "notif_mention_1",
  type: "mentioned",
  ...issueB,
  actorName: "Mina Chen",
  actorInitials: "MC",
  actionHref: `${emailStoryInboxUrl}/notifications/notif_mention_1`,
  excerpt: "Can you review the Vietnamese strings?",
};

export const statusChangedNotification: EmailNotificationItem = {
  id: "notif_status_1",
  type: "status_changed",
  ...issueB,
  actorName: "Otto Klein",
  actorInitials: "OK",
  actionHref: `${emailStoryInboxUrl}/notifications/notif_status_1`,
};

export const assigneeChangedNotification: EmailNotificationItem = {
  id: "notif_assignee_changed_1",
  type: "assignee_changed",
  ...issueA,
  actorName: "hans",
  actorInitials: "HB",
  actionHref: `${emailStoryInboxUrl}/notifications/notif_assignee_changed_1`,
};

export const digestSameIssueNotifications: EmailNotificationItem[] = [
  commentNotification,
  assignedNotification,
];

export const digestMultipleIssuesNotifications: EmailNotificationItem[] = [
  commentNotification,
  assignedNotification,
  mentionNotification,
  statusChangedNotification,
];

export const allTypesNotifications: EmailNotificationItem[] = [
  commentNotification,
  assignedNotification,
  mentionNotification,
  statusChangedNotification,
  assigneeChangedNotification,
];
