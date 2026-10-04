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
import { render } from "@react-email/render";
import { describe, expect, it } from "vite-plus/test";

import {
  IssueInboxNotificationsEmail,
  issueInboxNotificationsPlainText,
  type EmailNotificationItem,
  type IssueInboxNotificationsEmailProps,
} from "./issue-inbox-notifications-email";

function qaItem(overrides: Partial<EmailNotificationItem>): EmailNotificationItem {
  return {
    id: "notification-1",
    type: "qa_errors_increased",
    issueId: null,
    issueTitle: "Checkout",
    issueLabel: "QA",
    actorName: "Someone",
    actorInitials: "SO",
    actionHref: "https://app.example/org/acme/inbox/notifications/notification-1",
    errorsChange: 3,
    ...overrides,
  };
}

function props(notifications: EmailNotificationItem[]): IssueInboxNotificationsEmailProps {
  return {
    unreadCount: notifications.length,
    notifications,
    inboxUrl: "https://app.example/org/acme/inbox",
    unsubscribeUrl: "https://app.example/org/acme/settings/account#notifications",
    brandLogoUrl: "https://app.example/logo.png",
  };
}

describe("issue inbox notifications email QA alerts", () => {
  it("summarises QA alerts per project without an actor", () => {
    const text = issueInboxNotificationsPlainText(
      props([
        qaItem({}),
        qaItem({
          id: "notification-2",
          type: "qa_scan_failed",
          issueTitle: "Marketing site",
          errorsChange: null,
        }),
      ]),
    );

    expect(text).toContain("QA Checkout\n- 3 new QA errors since the previous scan");
    expect(text).toContain(
      "QA Marketing site\n- QA scan failed. Results may be out of date until a scan completes.",
    );
    expect(text).not.toContain("Someone");
  });

  it("uses the singular for one new error and links the alert in HTML", async () => {
    const item = qaItem({ errorsChange: 1 });
    const html = await render(IssueInboxNotificationsEmail(props([item])));

    expect(html).toContain("1 new QA error since the previous scan");
    expect(html).toContain(item.actionHref);
  });
});
