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
  issueDetailLoadingMswHandlers,
  issueDetailNotSubscribedMswHandlers,
  issueDetailUnavailableMswHandlers,
  issueSheetMswHandlers,
} from "../../projects/[projectId]/issue-sheet/_components/issue-sheet-msw-handlers";
import {
  issueSheetIssuesFixture,
  issueSheetOrganizationSlug,
  issueSheetProjectId,
} from "../../projects/[projectId]/issue-sheet/_components/issue-sheet.fixture";
import { IssueDetailPanel } from "./issue-detail-panel";

const issue = issueSheetIssuesFixture[0];

const meta = {
  title: "App/Issues/Detail",
  component: IssueDetailPanel,
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
    issueId: issue.id,
  },
} satisfies Meta<typeof IssueDetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Source string needs context"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Linked context")).toBeInTheDocument();
    await expect(canvas.getByText("Owner note")).toBeInTheDocument();
    const unsubscribe = await canvas.findByRole("button", { name: "Unsubscribe" });
    await expect(unsubscribe).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
    const commentsEmptyState = canvas.getByText(
      "No comments or activity yet. Start the discussion.",
    );
    await expect(commentsEmptyState).toBeVisible();
    expect(
      unsubscribe.compareDocumentPosition(commentsEmptyState) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};

export const NotSubscribed: Story = {
  parameters: {
    msw: {
      handlers: issueDetailNotSubscribedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Source string needs context"),
    ).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: issueDetailLoadingMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const Unavailable: Story = {
  parameters: {
    msw: {
      handlers: issueDetailUnavailableMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Could not load this issue.")).toBeInTheDocument();
  },
};
