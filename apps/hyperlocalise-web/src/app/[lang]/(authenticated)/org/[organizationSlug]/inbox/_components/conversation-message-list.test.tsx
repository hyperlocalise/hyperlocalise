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
// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test";
import { render } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { ConversationMessageList } from "./conversation-message-list";
import { currentUserFixture, messagesFixture } from "./inbox.fixture";
import type { StreamedAssistantMessage } from "./inbox-types";

function withIntl(element: ReactElement) {
  return (
    <IntlProvider locale="en" messages={{}}>
      {element}
    </IntlProvider>
  );
}

describe("ConversationMessageList", () => {
  it("styles user messages with the primary bubble", () => {
    const markup = renderToStaticMarkup(
      withIntl(
        <ConversationMessageList
          conversationId={messagesFixture[0].conversationId}
          currentUser={currentUserFixture}
          isLoading={false}
          isStreaming={false}
          messages={messagesFixture}
          streamedAssistant={null}
        />,
      ),
    );

    expect(markup).toContain("bg-primary");
    expect(markup).toContain("text-primary-foreground");
    expect(markup).toContain(messagesFixture[0].text);
  });

  it("keeps the streamed reply's DOM node when the persisted reply arrives", () => {
    const [userMessage, agentMessage] = messagesFixture;
    const streamedAssistant: StreamedAssistantMessage = {
      conversationId: userMessage.conversationId,
      responseToMessageId: userMessage.id,
      message: {
        id: `stream-${userMessage.id}`,
        role: "assistant",
        parts: [{ type: "text", text: agentMessage.text, state: "done" }],
      },
      status: "complete",
    };

    const { container, rerender } = render(
      withIntl(
        <ConversationMessageList
          conversationId={userMessage.conversationId}
          currentUser={currentUserFixture}
          isLoading={false}
          isStreaming={false}
          messages={[userMessage]}
          streamedAssistant={streamedAssistant}
        />,
      ),
    );
    const streamedItem = container.querySelector(
      `[data-message-id="${streamedAssistant.message.id}"]`,
    );
    expect(streamedItem).not.toBeNull();

    rerender(
      withIntl(
        <ConversationMessageList
          conversationId={userMessage.conversationId}
          currentUser={currentUserFixture}
          isLoading={false}
          isStreaming={false}
          messages={[userMessage, agentMessage]}
          streamedAssistant={streamedAssistant}
        />,
      ),
    );
    expect(container.querySelector(`[data-message-id="${agentMessage.id}"]`)).toBe(streamedItem);

    rerender(
      withIntl(
        <ConversationMessageList
          conversationId={userMessage.conversationId}
          currentUser={currentUserFixture}
          isLoading={false}
          isStreaming={false}
          messages={[userMessage, agentMessage]}
          streamedAssistant={null}
        />,
      ),
    );
    expect(container.querySelector(`[data-message-id="${agentMessage.id}"]`)).toBe(streamedItem);
  });

  it("shows a reply refused for used-up AI credit, with a way to change plan", () => {
    const [userMessage] = messagesFixture;
    const streamedAssistant: StreamedAssistantMessage = {
      conversationId: userMessage.conversationId,
      responseToMessageId: userMessage.id,
      message: { id: `stream-${userMessage.id}`, role: "assistant", parts: [] },
      status: "error",
      aiCreditExhausted: true,
    };

    const { getByRole } = render(
      withIntl(
        <ConversationMessageList
          conversationId={userMessage.conversationId}
          currentUser={currentUserFixture}
          isLoading={false}
          isStreaming={false}
          messages={[userMessage]}
          organizationSlug="acme"
          streamedAssistant={streamedAssistant}
        />,
      ),
    );

    expect(getByRole("alert").textContent).toContain(
      "Your workspace has used all of its AI credit.",
    );
    expect(getByRole("link", { name: "Upgrade plan" }).getAttribute("href")).toContain("acme");
  });
});
