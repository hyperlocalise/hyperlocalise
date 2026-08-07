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
import { expect, userEvent, within } from "storybook/test";

import {
  issueSheetManySubscribersFixture,
  issueSheetOrganizationSlug,
  issueSheetProjectId,
} from "../../projects/[projectId]/issue-sheet/_components/issue-sheet.fixture";
import {
  issueDetailManySubscribersMswHandlers,
  issueSheetMswHandlers,
} from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-msw-handlers";
import { IssueWatchControl } from "./issue-watch-control";

const issueId = "issue_001";

function CommentSectionPreview() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
      Comment thread appears below the subscribe row.
    </div>
  );
}

const meta = {
  title: "App/Issue Detail/Subscribe Control",
  component: IssueWatchControl,
  decorators: [
    (Story) => (
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background p-6">
        <Story />
        <CommentSectionPreview />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  args: {
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
    issueId,
    disabled: false,
  },
} satisfies Meta<typeof IssueWatchControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Subscribed: Story = {
  args: {
    isWatching: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
  },
};

export const NotSubscribed: Story = {
  args: {
    isWatching: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
  },
};

export const ManySubscribers: Story = {
  args: {
    isWatching: true,
  },
  parameters: {
    msw: {
      handlers: issueDetailManySubscribersMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
    await expect(canvas.getByTitle("Aiko Tanaka")).toBeInTheDocument();
    await expect(canvas.getByText("+2")).toBeInTheDocument();
    expect(issueSheetManySubscribersFixture.length).toBeGreaterThan(3);
  },
};

export const ToggleSubscription: Story = {
  args: {
    isWatching: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Unsubscribe" });
    await userEvent.click(button);
    await expect(canvas.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Subscribe" }));
    await expect(canvas.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
  },
};

export const Disabled: Story = {
  args: {
    isWatching: false,
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Subscribe" })).toBeDisabled();
  },
};
