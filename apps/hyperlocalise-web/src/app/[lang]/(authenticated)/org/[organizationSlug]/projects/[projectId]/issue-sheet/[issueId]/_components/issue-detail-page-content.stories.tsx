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

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";

import {
  issueDetailColumnsErrorMswHandlers,
  issueDetailLoadingMswHandlers,
  issueDetailManySubscribersMswHandlers,
  issueDetailNotFoundMswHandlers,
  issueDetailNotSubscribedMswHandlers,
  issueSheetMswHandlers,
} from "../../_components/issue-sheet-msw-handlers";
import {
  issueSheetIssuesFixture,
  issueSheetOrganizationSlug,
  issueSheetProjectId,
} from "../../_components/issue-sheet.fixture";
import { IssueDetailPageContent } from "./issue-detail-page-content";

const issueId = issueSheetIssuesFixture[0]?.id ?? "issue_001";

const meta = {
  title: "App/Issues/Detail",
  component: IssueDetailPageContent,
  decorators: [
    (Story) => (
      <AppShellStoreProvider defaultNavigationGroups={[]}>
        <div className="flex h-dvh flex-col">
          <Story />
        </div>
      </AppShellStoreProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet/${issueId}`,
      },
    },
  },
  args: {
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
    issueId,
  },
} satisfies Meta<typeof IssueDetailPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvas.getByText("Owner note")).toBeInTheDocument();
    await expect(canvas.getByText("Context")).toBeInTheDocument();
    await expect(canvas.getByText("Sprint")).toBeInTheDocument();
    await expect(canvas.getByText("Waiting on product copy review.")).toBeInTheDocument();
    const openInCat = canvas.getByRole("link", { name: "Open in CAT" });
    await expect(openInCat).toBeInTheDocument();
    await expect(openInCat).toHaveAttribute("target", "_blank");
    await expect(canvas.getAllByRole("link", { name: "Open in CAT" })).toHaveLength(1);
    const unsubscribe = await canvas.findByRole("button", { name: "Unsubscribe" });
    await expect(unsubscribe).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
  },
};

export const LegacyStoredCatLink: Story = {
  args: {
    issueId: "issue_cat_legacy_link",
  },
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet/issue_cat_legacy_link`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Legacy stored CAT share link")).toBeInTheDocument();
    await expect(canvas.getAllByRole("link", { name: "Open in CAT" })).toHaveLength(1);
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
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Copy review tracked in Jira")).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Open in CAT" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "View in Jira" })).toBeInTheDocument();
  },
};

export const NotSubscribed: Story = {
  parameters: {
    msw: {
      handlers: issueDetailNotSubscribedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Mina Chen")).toBeInTheDocument();
    await expect(canvas.getByTitle("Otto Klein")).toBeInTheDocument();
  },
};

export const ManySubscribers: Story = {
  parameters: {
    msw: {
      handlers: issueDetailManySubscribersMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    await expect(canvas.getByTitle("Aiko Tanaka")).toBeInTheDocument();
    await expect(canvas.getByText("+2")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: issueDetailLoadingMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
    await expect(canvas.queryByText("Source string needs context")).not.toBeInTheDocument();
  },
};

export const NotFound: Story = {
  parameters: {
    msw: {
      handlers: issueDetailNotFoundMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("This issue could not be found.")).toBeInTheDocument();
  },
};

export const ColumnsError: Story = {
  parameters: {
    msw: {
      handlers: issueDetailColumnsErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvas.getByText("Custom fields could not be loaded.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    await expect(canvas.queryByText("Sprint")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Context")).not.toBeInTheDocument();
  },
};

export const WithCustomFields: Story = {
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Source string needs context")).toBeInTheDocument();
    await expect(await canvas.findByText("Context")).toBeInTheDocument();
    await expect(canvas.getByText("Acceptance criteria")).toBeInTheDocument();
    await expect(
      canvas.getByText("Confirm CTA meaning with product before translation."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Sprint")).toBeInTheDocument();
    await expect(canvas.getByText("Sprint 24")).toBeInTheDocument();
    await expect(canvas.getByText("Component")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("Checkout")).toBeInTheDocument();
    await expect(canvas.getByText("Reviewer")).toBeInTheDocument();
  },
};
