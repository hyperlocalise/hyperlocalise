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
import { expect, fn } from "storybook/test";

import {
  conversationsFixture,
  createStreamedAssistantMessage,
  currentUserFixture,
  linkedJobsFixture,
  messagesFixture,
} from "./inbox.fixture";
import { ConversationPanel } from "./conversation-panel";

const meta = {
  title: "App/Inbox/ConversationPanel",
  component: ConversationPanel,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-[40rem] bg-background">
        <Story />
      </div>
    ),
  ],
  args: {
    organizationSlug: "acme",
    currentUser: currentUserFixture,
    conversation: conversationsFixture[0],
    messages: messagesFixture,
    messagesIsLoading: false,
    jobs: linkedJobsFixture,
    jobsIsLoading: false,
    isSending: false,
    isStreaming: false,
    streamedAssistant: null,
    onSendMessage: fn(),
  },
} satisfies Meta<typeof ConversationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChatConversation: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Translate homepage hero copy" }),
    ).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText("Ask Hyperlocalise…")).toBeInTheDocument();
  },
};

export const NoSelection: Story = {
  args: {
    conversation: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Select a conversation to view details")).toBeInTheDocument();
  },
};

export const LoadingMessages: Story = {
  args: {
    messages: [],
    messagesIsLoading: true,
    jobsIsLoading: true,
  },
};

export const EmptyMessages: Story = {
  args: {
    messages: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No messages yet")).toBeInTheDocument();
  },
};

export const EmailConversation: Story = {
  args: {
    conversation: conversationsFixture[1],
    messages: [],
    jobs: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByPlaceholderText("Ask Hyperlocalise…")).not.toBeInTheDocument();
  },
};

export const Streaming: Story = {
  args: {
    isStreaming: true,
    streamedAssistant: createStreamedAssistantMessage(),
  },
};
