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
import { IntlProvider } from "react-intl";
import { renderToStaticMarkup } from "react-dom/server";

import { ConversationMessageList } from "./conversation-message-list";
import { currentUserFixture, messagesFixture } from "./inbox.fixture";

describe("ConversationMessageList", () => {
  it("styles user messages with the primary bubble", () => {
    const markup = renderToStaticMarkup(
      <IntlProvider locale="en" messages={{}}>
        <ConversationMessageList
          conversationId={messagesFixture[0].conversationId}
          currentUser={currentUserFixture}
          isLoading={false}
          isStreaming={false}
          messages={messagesFixture}
          streamedAssistant={null}
        />
      </IntlProvider>,
    );

    expect(markup).toContain("bg-primary");
    expect(markup).toContain("text-primary-foreground");
    expect(markup).toContain(messagesFixture[0].text);
  });
});
