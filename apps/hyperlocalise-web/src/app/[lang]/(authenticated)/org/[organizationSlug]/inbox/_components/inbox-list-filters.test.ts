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

import {
  filterInboxIndexItems,
  isInboxListFiltersActive,
  type InboxIndexItem,
} from "./inbox-list-filters";
import type { InboxIssueNotification } from "./inbox-notifications-api";
import type { Conversation } from "./inbox-types";

function conversation(
  partial: Partial<Conversation> & Pick<Conversation, "id" | "source">,
): InboxIndexItem {
  return {
    kind: "conversation",
    conversation: {
      title: "Conversation",
      status: "active",
      projectId: null,
      lastMessageAt: "2026-01-01T12:00:00.000Z",
      createdAt: "2026-01-01T12:00:00.000Z",
      participantEmail: null,
      lastMessage: null,
      ...partial,
    },
    sortAt: "2026-01-01T12:00:00.000Z",
  };
}

function notification(
  partial: Partial<InboxIssueNotification> & Pick<InboxIssueNotification, "id" | "type">,
): InboxIndexItem {
  return {
    kind: "notification",
    notification: {
      organizationId: "org",
      projectId: "project",
      issueId: "issue",
      payload: { issueTitle: "Issue", projectId: "project" },
      actor: null,
      readAt: null,
      createdAt: "2026-01-01T11:00:00.000Z",
      ...partial,
    },
    sortAt: "2026-01-01T11:00:00.000Z",
  };
}

const items: InboxIndexItem[] = [
  conversation({ id: "chat", source: "chat_ui" }),
  conversation({ id: "email", source: "email_agent" }),
  notification({ id: "unread-mention", type: "mentioned", readAt: null }),
  notification({
    id: "read-comment",
    type: "comment",
    readAt: "2026-01-01T10:00:00.000Z",
  }),
];

function ids(filtered: InboxIndexItem[]) {
  return filtered.map((item) =>
    item.kind === "conversation" ? item.conversation.id : item.notification.id,
  );
}

describe("isInboxListFiltersActive", () => {
  it("is inactive when both filters are all", () => {
    expect(isInboxListFiltersActive({ read: "all", type: "all" })).toBe(false);
  });

  it("is active when either filter is set", () => {
    expect(isInboxListFiltersActive({ read: "unread", type: "all" })).toBe(true);
    expect(isInboxListFiltersActive({ read: "all", type: "mentioned" })).toBe(true);
  });
});

describe("filterInboxIndexItems", () => {
  it("returns every item when filters are all", () => {
    expect(ids(filterInboxIndexItems(items, { read: "all", type: "all" }))).toEqual([
      "chat",
      "email",
      "unread-mention",
      "read-comment",
    ]);
  });

  it("keeps unread notifications and hides conversations", () => {
    expect(ids(filterInboxIndexItems(items, { read: "unread", type: "all" }))).toEqual([
      "unread-mention",
    ]);
  });

  it("keeps read notifications and conversations", () => {
    expect(ids(filterInboxIndexItems(items, { read: "read", type: "all" }))).toEqual([
      "chat",
      "email",
      "read-comment",
    ]);
  });

  it("filters conversations by source", () => {
    expect(ids(filterInboxIndexItems(items, { read: "all", type: "email_agent" }))).toEqual([
      "email",
    ]);
  });

  it("filters notifications by type", () => {
    expect(ids(filterInboxIndexItems(items, { read: "all", type: "comment" }))).toEqual([
      "read-comment",
    ]);
  });

  it("combines read and type filters", () => {
    expect(ids(filterInboxIndexItems(items, { read: "unread", type: "mentioned" }))).toEqual([
      "unread-mention",
    ]);
    expect(ids(filterInboxIndexItems(items, { read: "unread", type: "email_agent" }))).toEqual([]);
  });

  it("filters the broad conversation and notification groups", () => {
    expect(ids(filterInboxIndexItems(items, { read: "all", type: "conversations" }))).toEqual([
      "chat",
      "email",
    ]);
    expect(ids(filterInboxIndexItems(items, { read: "all", type: "notifications" }))).toEqual([
      "unread-mention",
      "read-comment",
    ]);
  });
});
