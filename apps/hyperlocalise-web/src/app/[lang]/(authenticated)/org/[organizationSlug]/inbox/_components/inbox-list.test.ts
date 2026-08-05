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
import { describe, expect, it } from "vite-plus/test";

import { buildInboxIndexItems, notificationSecondaryText } from "./inbox-list";
import type { InboxIssueNotification } from "./inbox-notifications-api";
import type { Conversation } from "./inbox-types";

function conversation(
  partial: Partial<Conversation> & Pick<Conversation, "id" | "lastMessageAt">,
): Conversation {
  return {
    title: "Conversation",
    source: "chat_ui",
    status: "active",
    projectId: null,
    createdAt: partial.lastMessageAt,
    participantEmail: null,
    lastMessage: null,
    ...partial,
  };
}

function notification(
  partial: Partial<InboxIssueNotification> & Pick<InboxIssueNotification, "id" | "createdAt">,
): InboxIssueNotification {
  return {
    organizationId: "org",
    projectId: "project",
    issueId: "issue",
    type: "assigned",
    payload: { issueTitle: "Issue", projectId: "project" },
    actor: null,
    readAt: null,
    ...partial,
  };
}

describe("notificationSecondaryText", () => {
  it("strips user and issue mention markdown from comment excerpts", () => {
    expect(
      notificationSecondaryText(
        "Hello [@Vi Nguyen](mention:user:962fec59-8275-4000-8000-000000000001) re [@HL-12](mention:issue:22222222-2222-4222-8222-222222222222:project_website)",
        "Someone mentioned you",
      ),
    ).toBe("Hello @Vi Nguyen re @HL-12");
  });

  it("falls back to the preview when the excerpt is empty", () => {
    expect(notificationSecondaryText("  ", "Someone mentioned you")).toBe("Someone mentioned you");
  });
});

describe("buildInboxIndexItems", () => {
  it("interleaves conversations and notifications by activity time", () => {
    const items = buildInboxIndexItems(
      [
        conversation({ id: "c-old", lastMessageAt: "2026-01-01T10:00:00.000Z" }),
        conversation({ id: "c-new", lastMessageAt: "2026-01-01T12:00:00.000Z" }),
      ],
      [notification({ id: "n-mid", createdAt: "2026-01-01T11:00:00.000Z" })],
    );

    expect(
      items.map((item) =>
        item.kind === "conversation" ? item.conversation.id : item.notification.id,
      ),
    ).toEqual(["c-new", "n-mid", "c-old"]);
  });
});
