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
  getConversationListItemVisual,
  getNotificationListItemVisual,
} from "./inbox-list-item-visuals";

const intl = {
  formatMessage: (descriptor: { defaultMessage?: string }, values?: Record<string, string>) => {
    let message = descriptor.defaultMessage ?? "";
    if (values) {
      for (const [key, value] of Object.entries(values)) {
        message = message.replace(`{${key}}`, value);
      }
    }
    return message;
  },
} as never;

describe("getConversationListItemVisual", () => {
  it("maps each conversation source to a type label", () => {
    expect(getConversationListItemVisual("chat_ui", intl).typeIconLabel).toBe("Chat");
    expect(getConversationListItemVisual("email_agent", intl).typeIconLabel).toBe("Email");
    expect(getConversationListItemVisual("github_agent", intl).typeIconLabel).toBe("GitHub");
    expect(getConversationListItemVisual("slack_agent", intl).typeIconLabel).toBe("Slack");
    expect(getConversationListItemVisual("web_chat", intl).typeIconLabel).toBe("Web chat");
  });
});

describe("getNotificationListItemVisual", () => {
  it("maps each notification type to a short label", () => {
    expect(getNotificationListItemVisual("assigned", intl).typeIconLabel).toBe("Assignment");
    expect(getNotificationListItemVisual("mentioned", intl).typeIconLabel).toBe("Mention");
    expect(getNotificationListItemVisual("comment", intl).typeIconLabel).toBe("Comment");
    expect(getNotificationListItemVisual("status_changed", intl).typeIconLabel).toBe(
      "Status change",
    );
    expect(getNotificationListItemVisual("assignee_changed", intl).typeIconLabel).toBe(
      "Assignee change",
    );
  });
});
