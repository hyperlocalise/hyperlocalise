/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { conversationsFixture, currentUserFixture } from "./inbox.fixture";
import { InboxList } from "./inbox-list";

const meta = {
  title: "App/Inbox/List",
  component: InboxList,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="h-[32rem] w-full max-w-sm border border-border bg-background">
        <Story />
      </div>
    ),
  ],
  args: {
    conversations: conversationsFixture,
    currentUser: currentUserFixture,
    isLoading: false,
    isError: false,
    selectedConversationId: conversationsFixture[0].id,
    onSelectConversation: fn(),
  },
} satisfies Meta<typeof InboxList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate homepage hero copy")).toBeInTheDocument();
    await expect(canvas.getByText("Email: Q3 release notes")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    conversations: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    conversations: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No conversations yet.")).toBeInTheDocument();
  },
};

export const Error: Story = {
  args: {
    conversations: [],
    isError: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Unable to load conversations.")).toBeInTheDocument();
  },
};
