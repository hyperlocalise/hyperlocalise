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
  issueDetailColumnsErrorMswHandlers,
  issueDetailLoadingMswHandlers,
  issueDetailNotFoundMswHandlers,
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
  title: "App/Project/Issue Sheet/Detail",
  component: IssueDetailPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
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
    await expect(canvas.getByRole("button", { name: "Open in CAT" })).toBeInTheDocument();
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
