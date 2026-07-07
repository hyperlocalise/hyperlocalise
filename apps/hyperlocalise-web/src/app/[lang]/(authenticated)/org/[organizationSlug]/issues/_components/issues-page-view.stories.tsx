import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

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
    view: "all_open",
    search: "",
    isLoading: false,
    isError: false,
    isFetchingMore: false,
    hasMore: false,
    onViewChange: fn(),
    onSearchChange: fn(),
    onLoadMore: fn(),
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

export const QaTriageView: Story = {
  args: {
    view: "qa_triage",
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
