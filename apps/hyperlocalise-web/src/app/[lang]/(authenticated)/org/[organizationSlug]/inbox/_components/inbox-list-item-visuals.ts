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
import type { ComponentProps } from "react";
import {
  Chat01Icon,
  Comment01Icon,
  Flag01Icon,
  Mail01Icon,
  Message01Icon,
  SlackIcon,
  SourceCodeIcon,
  UserIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";
import type { IntlShape } from "react-intl";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { inboxNotificationsMessages } from "./inbox-notifications.messages";
import type { InboxIssueNotification } from "./inbox-notifications-api";
import { getSourceLabel, type Conversation } from "./inbox-types";

type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];

/** Icon colors tuned for `bg-card` badge backgrounds in light and dark themes. */
const inboxBadgeIconBlue = "text-blue-800 dark:text-blue-900";
const inboxBadgeIconPurple = "text-purple-800 dark:text-purple-900";
const inboxBadgeIconAmber = "text-amber-900 dark:text-amber-700";
const inboxBadgeIconGreen = "text-green-900 dark:text-green-900";
const inboxBadgeIconNeutral = "text-foreground";
const inboxBadgeIconPrimary = "text-primary";

export type InboxListItemVisual = {
  typeIcon: Icon;
  typeIconLabel: string;
  /** Tailwind color classes applied directly to the badge icon. */
  badgeClassName: string;
};

export function getConversationListItemVisual(
  source: Conversation["source"],
  intl: IntlShape,
): InboxListItemVisual {
  const typeIconLabel = getSourceLabel(source, intl);

  switch (source) {
    case "chat_ui":
      return {
        typeIcon: Chat01Icon,
        typeIconLabel,
        badgeClassName: inboxBadgeIconBlue,
      };
    case "web_chat":
      return {
        typeIcon: Message01Icon,
        typeIconLabel,
        badgeClassName: inboxBadgeIconPurple,
      };
    case "email_agent":
      return {
        typeIcon: Mail01Icon,
        typeIconLabel,
        badgeClassName: inboxBadgeIconAmber,
      };
    case "github_agent":
      return {
        typeIcon: SourceCodeIcon,
        typeIconLabel,
        badgeClassName: inboxBadgeIconNeutral,
      };
    case "slack_agent":
      return {
        typeIcon: SlackIcon,
        typeIconLabel,
        badgeClassName: inboxBadgeIconGreen,
      };
    default:
      return assertNever(source);
  }
}

export function getNotificationListItemVisual(
  type: InboxIssueNotification["type"],
  intl: IntlShape,
): InboxListItemVisual {
  switch (type) {
    case "assigned":
      return {
        typeIcon: UserIcon,
        typeIconLabel: intl.formatMessage(inboxNotificationsMessages.assignedType),
        badgeClassName: inboxBadgeIconPrimary,
      };
    case "mentioned":
      return {
        typeIcon: Message01Icon,
        typeIconLabel: intl.formatMessage(inboxNotificationsMessages.mentionedType),
        badgeClassName: inboxBadgeIconBlue,
      };
    case "comment":
      return {
        typeIcon: Comment01Icon,
        typeIconLabel: intl.formatMessage(inboxNotificationsMessages.commentType),
        badgeClassName: inboxBadgeIconNeutral,
      };
    case "status_changed":
      return {
        typeIcon: Flag01Icon,
        typeIconLabel: intl.formatMessage(inboxNotificationsMessages.statusChangedType),
        badgeClassName: inboxBadgeIconAmber,
      };
    case "assignee_changed":
      return {
        typeIcon: UserMultiple02Icon,
        typeIconLabel: intl.formatMessage(inboxNotificationsMessages.assigneeChangedType),
        badgeClassName: inboxBadgeIconPurple,
      };
    default:
      return assertNever(type);
  }
}
