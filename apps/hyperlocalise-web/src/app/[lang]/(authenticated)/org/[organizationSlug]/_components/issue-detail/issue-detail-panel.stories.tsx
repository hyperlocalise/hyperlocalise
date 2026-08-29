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
import { expect, userEvent } from "storybook/test";

import {
  issueDetailColumnsErrorMswHandlers,
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

const desktopViewport = {
  defaultViewport: "desktop",
} as const;

const meta = {
  title: "App/Issues/Detail Panel",
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
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet/${issue.id}`,
      },
    },
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
    viewport: desktopViewport,
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
    await expect(
      unsubscribe.compareDocumentPosition(commentsEmptyState) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const openInCat = await canvas.findByRole("link", { name: "Open in Content Editor" });
    await expect(openInCat).toHaveAttribute("target", "_blank");
    await expect(canvas.getAllByRole("link", { name: "Open in Content Editor" })).toHaveLength(1);
    await expect(
      await canvas.findByRole("button", { name: "Collapse properties" }),
    ).toBeInTheDocument();
  },
};

export const WithExternalLink: Story = {
  args: {
    issueId: "issue_external_ref",
  },
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet/issue_external_ref`,
      },
    },
    viewport: desktopViewport,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Copy review tracked in Jira"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("link", { name: "Open in Content Editor" }),
    ).not.toBeInTheDocument();
    const jiraLink = await canvas.findByRole("link", { name: "View in Jira" });
    await expect(jiraLink).toHaveAttribute("href", "https://jira.example.com/browse/LOC-42");
    await expect(jiraLink).toHaveAttribute("target", "_blank");
  },
};

export const MinimizedSidebar: Story = {
  args: {
    defaultSidebarOpen: false,
  },
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
    viewport: desktopViewport,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Source string needs context"),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole("button", { name: "Expand properties" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open in Content Editor" })).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(canvas.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Priority" })).toBeInTheDocument();
    await expect(canvas.queryByText("Reporter")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Expand properties" }));
    await expect(
      await canvas.findByRole("button", { name: "Collapse properties" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("Reporter")).toBeInTheDocument();
  },
};

export const NotSubscribed: Story = {
  parameters: {
    msw: {
      handlers: issueDetailNotSubscribedMswHandlers,
    },
    viewport: desktopViewport,
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

export const WithCustomFields: Story = {
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
    viewport: desktopViewport,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Source string needs context"),
    ).toBeInTheDocument();

    await expect(await canvas.findByText("Context")).toBeInTheDocument();
    await expect(canvas.getByText("Acceptance criteria")).toBeInTheDocument();
    await expect(
      canvas.getByText("Confirm CTA meaning with product before translation."),
    ).toBeInTheDocument();

    await expect(await canvas.findByText("Sprint")).toBeInTheDocument();
    await expect(canvas.getByText("Sprint 24")).toBeInTheDocument();
    await expect(canvas.getByText("Component")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("Checkout")).toBeInTheDocument();
    await expect(canvas.getByText("Reviewer")).toBeInTheDocument();
    await expect(canvas.getByText("Mina Chen")).toBeInTheDocument();
  },
};

export const WithFilledEnrichment: Story = {
  args: {
    issueId: issueSheetIssuesFixture[2].id,
  },
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet/${issueSheetIssuesFixture[2].id}`,
      },
    },
    viewport: desktopViewport,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("QA failure on hero headline"),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByText("Suggested shorter headline: Willkommen zurück"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("German headline fits the hero without wrapping on mobile."),
    ).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("Marketing")).toBeInTheDocument();
    await expect(canvas.getByText("Sprint 24")).toBeInTheDocument();
  },
};

export const ColumnsLoadError: Story = {
  parameters: {
    msw: {
      handlers: issueDetailColumnsErrorMswHandlers,
    },
    viewport: desktopViewport,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Source string needs context"),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("Custom fields could not be loaded.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    await expect(canvas.queryByText("Sprint")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Context")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Acceptance criteria")).not.toBeInTheDocument();
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
