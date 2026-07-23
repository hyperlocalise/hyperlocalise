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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  conversationsFixture,
  createStreamedAssistantMessage,
  currentUserFixture,
  messagesFixture,
} from "./inbox.fixture";
import { ConversationMessageList } from "./conversation-message-list";

const meta = {
  title: "App/Inbox/MessageList",
  component: ConversationMessageList,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="h-[32rem] w-full max-w-3xl border border-border bg-background">
        <Story />
      </div>
    ),
  ],
  args: {
    conversationId: conversationsFixture[0].id,
    currentUser: currentUserFixture,
    messages: messagesFixture,
    isLoading: false,
    isStreaming: false,
    streamedAssistant: null,
  },
} satisfies Meta<typeof ConversationMessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Can you localize the hero section for French and German?"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "I'll start by extracting the hero strings and creating translation jobs for French and German.",
      ),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    messages: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    messages: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No messages yet")).toBeInTheDocument();
  },
};

export const Streaming: Story = {
  args: {
    isStreaming: true,
    streamedAssistant: createStreamedAssistantMessage(),
  },
};

export const ScreenshotProgressAndReasoning: Story = {
  args: {
    messages: [messagesFixture[0]],
    isStreaming: true,
    streamedAssistant: createStreamedAssistantMessage({
      message: {
        id: "stream-screenshot-progress",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "I found the matching Storybook story and am verifying the localized state.",
            state: "done",
          },
          {
            type: "tool-captureScreenshot",
            toolCallId: "capture-story",
            state: "input-available",
            input: {
              target: {
                type: "storybook",
                storyId: "app-inbox-message-list--default",
              },
            },
          },
          {
            type: "data-toolProgress",
            id: "capture-story",
            data: {
              toolCallId: "capture-story",
              message: "Preparing browser and loading story…",
            },
          },
        ],
      },
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Preparing browser and loading story…")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "I found the matching Storybook story and am verifying the localized state.",
      ),
    ).toBeInTheDocument();
  },
};
