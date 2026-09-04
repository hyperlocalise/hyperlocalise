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
  createOrganizationIssue,
  issuesOrganizationSlug,
  issuesSummaryFixture,
  organizationIssuesFixture,
} from "../issues/_components/issues.fixture";
import { issueSheetMswHandlers } from "../projects/[projectId]/issue-sheet/_components/issue-sheet-msw-handlers";
import { IssueGroupedList } from "./issue-grouped-list";

const meta = {
  title: "App/Issues/Grouped List",
  component: IssueGroupedList,
  parameters: {
    layout: "padded",
    msw: {
      handlers: issueSheetMswHandlers,
    },
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

export const CollapsedThenSingleStatus: Story = {
  args: {
    activeStatus: "open",
    issues: organizationIssuesFixture.filter((issue) => issue.status === "open"),
    summary: {
      open: 2,
      inProgress: 0,
      resolved: 0,
      wontFix: 0,
    },
  },
  play: async ({ canvas }) => {
    // Headers are hidden for a single-status filter, so a previously collapsed
    // Open group must still show its rows.
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvas.getByText("Glossary violation in onboarding")).toBeInTheDocument();
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

export const Loading: Story = {
  args: {
    issues: [],
    summary: undefined,
    isLoading: true,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const Error: Story = {
  args: {
    issues: [],
    summary: undefined,
    isError: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Failed to load")).toBeInTheDocument();
  },
};

export const NarrowRow: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
  args: {
    issues: [
      createOrganizationIssue({
        updatedAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
      }),
    ],
    summary: {
      open: 1,
      inProgress: 0,
      resolved: 0,
      wontFix: 0,
    },
  },
  play: async ({ canvas }) => {
    const date = canvas.getByRole("time");
    await expect(date).toBeVisible();
    await expect(date.scrollWidth).toBeLessThanOrEqual(date.clientWidth);
    await expect(date.textContent?.length).toBeGreaterThan(0);
    await expect(date.getAttribute("title")).toBeTruthy();
  },
};
