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
  issuesOrganizationSlug,
  issuesSummaryFixture,
  organizationIssuesFixture,
} from "../issues/_components/issues.fixture";
import { IssueGroupedList } from "./issue-grouped-list";

const meta = {
  title: "App/Issues/Grouped List",
  component: IssueGroupedList,
  parameters: {
    layout: "padded",
  },
  args: {
    organizationSlug: issuesOrganizationSlug,
    issues: organizationIssuesFixture,
    summary: issuesSummaryFixture,
    showProject: true,
    isLoading: false,
    isError: false,
    empty: "No issues",
    error: "Failed to load",
    onIssueActivate: fn(),
  },
} satisfies Meta<typeof IssueGroupedList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultiStatus: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Open")).toBeInTheDocument();
    await expect(canvas.getByText("In progress")).toBeInTheDocument();
    await expect(canvas.getByText("Resolved")).toBeInTheDocument();
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvasElement.querySelector("table")).toBeNull();
  },
};

export const CollapsedSection: Story = {
  play: async ({ canvas }) => {
    const openHeader = canvas.getByRole("button", { name: /Collapse Open/i });
    await userEvent.click(openHeader);
    await expect(canvas.queryByText("Source string needs context")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Expand Open/i })).toBeInTheDocument();
  },
};

export const SingleStatus: Story = {
  args: {
    activeStatus: "resolved",
    issues: organizationIssuesFixture.filter((issue) => issue.status === "resolved"),
    summary: {
      open: 0,
      inProgress: 0,
      resolved: 1,
      wontFix: 0,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("QA failure on hero headline")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Collapse/i })).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    issues: [],
    summary: {
      open: 0,
      inProgress: 0,
      resolved: 0,
      wontFix: 0,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No issues")).toBeInTheDocument();
  },
};
