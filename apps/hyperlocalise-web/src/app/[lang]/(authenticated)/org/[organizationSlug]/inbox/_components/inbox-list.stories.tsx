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
import { expect, fn, userEvent } from "storybook/test";

import {
  conversationsFixture,
  currentUserFixture,
  issueNotificationsFixture,
} from "./inbox.fixture";
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
    hasMoreNotifications: false,
    isLoadingMoreNotifications: false,
    notifications: [],
    onLoadMoreNotifications: fn(),
    onMarkAllRead: fn(),
    onSelectConversation: fn(),
    onSelectNotification: fn(),
    selection: { kind: "conversation", id: conversationsFixture[0].id },
    unreadNotificationCount: 0,
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

export const WithIssueNotifications: Story = {
  args: {
    notifications: issueNotificationsFixture,
    unreadNotificationCount: 2,
    selection: { kind: "notification", id: issueNotificationsFixture[0].id },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Source string needs context").length).toBeGreaterThan(0);
    await expect(
      canvas.getByText("Otto Klein assigned you to Source string needs context"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Checkout CTA tone feels off")).toBeInTheDocument();
    await expect(canvas.getByText("Can you review the CTA wording?")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
  },
};

export const IssueNotificationsOnly: Story = {
  args: {
    conversations: [],
    notifications: issueNotificationsFixture,
    unreadNotificationCount: 2,
    selection: { kind: "notification", id: issueNotificationsFixture[0].id },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Translate homepage hero copy")).not.toBeInTheDocument();
    await expect(canvas.getByText("Checkout CTA tone feels off")).toBeInTheDocument();
    await expect(canvas.getByText("Can you review the CTA wording?")).toBeInTheDocument();
    await expect(
      canvas.getByText("Added a screenshot from the checkout flow."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Otto Klein changed status of Glossary term mismatch"),
    ).toBeInTheDocument();
  },
};

export const MarkAllRead: Story = {
  args: {
    conversations: [],
    notifications: issueNotificationsFixture,
    unreadNotificationCount: 2,
    selection: { kind: "notification", id: issueNotificationsFixture[0].id },
  },
  play: async ({ canvas, args }) => {
    const markAllRead = await canvas.findByRole("button", { name: "Mark all as read" });
    await userEvent.click(markAllRead);
    await expect(args.onMarkAllRead).toHaveBeenCalled();
  },
};

export const LoadMoreNotifications: Story = {
  args: {
    conversations: [],
    notifications: issueNotificationsFixture,
    hasMoreNotifications: true,
    unreadNotificationCount: 2,
    selection: { kind: "notification", id: issueNotificationsFixture[0].id },
  },
  play: async ({ canvas, args }) => {
    const loadMore = await canvas.findByRole("button", { name: "Load more" });
    await userEvent.click(loadMore);
    await expect(args.onLoadMoreNotifications).toHaveBeenCalled();
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
    selection: null,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No conversations or notifications yet.")).toBeInTheDocument();
  },
};

export const NewRequest: Story = {
  args: {
    selection: { kind: "new" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("New Request")).toBeInTheDocument();
    await expect(canvas.getByText("Start a localisation request")).toBeInTheDocument();
    await expect(canvas.getByText("Translate homepage hero copy")).toBeInTheDocument();
  },
};

export const Error: Story = {
  args: {
    conversations: [],
    isError: true,
    selection: null,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Unable to load inbox.")).toBeInTheDocument();
  },
};
