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

import { IssuesActions } from "./issues-actions";
import {
  issuesOrganizationSlug,
  issuesSummaryFixture,
  organizationIssuesFixture,
} from "./issues.fixture";
import { IssuesPageView } from "./issues-page-view";

const meta = {
  title: "App/Issues/Page",
  component: IssuesPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: issuesOrganizationSlug,
    issues: organizationIssuesFixture,
    summary: issuesSummaryFixture,
    isLoading: false,
    isError: false,
    isFetchingMore: false,
    hasMore: false,
    filterBar: <div data-testid="issue-filters">Filters</div>,
    onLoadMore: fn(),
    onIssueRowClick: fn(),
    onIssueRowKeyDown: fn(),
    onStopRowActivation: fn(),
  },
} satisfies Meta<typeof IssuesPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Issues" })).toBeInTheDocument();
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvas.getByText("Website localization")).toBeInTheDocument();
    await expect(canvas.getByText("4 total")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    issues: [],
    summary: undefined,
    isLoading: true,
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Issues" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const Empty: Story = {
  args: {
    issues: [],
    summary: {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      wontFix: 0,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No issues match this view.")).toBeInTheDocument();
  },
};

export const Error: Story = {
  args: {
    issues: [],
    summary: undefined,
    isError: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Issues could not be loaded.")).toBeInTheDocument();
  },
};

export const LoadMore: Story = {
  args: {
    hasMore: true,
    isFetchingMore: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Loading..." })).toBeDisabled();
  },
};

export const WithActions: Story = {
  args: {
    actions: (
      <IssuesActions organizationSlug={issuesOrganizationSlug} onIssuesChanged={async () => {}} />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Issue" })).toBeInTheDocument();
  },
};

export const QaTriageView: Story = {
  args: {
    issues: organizationIssuesFixture.filter((issue) => issue.issueType === "qa_failure"),
    summary: {
      total: 1,
      open: 0,
      inProgress: 0,
      resolved: 1,
      wontFix: 0,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("QA failure on hero headline")).toBeInTheDocument();
  },
};
