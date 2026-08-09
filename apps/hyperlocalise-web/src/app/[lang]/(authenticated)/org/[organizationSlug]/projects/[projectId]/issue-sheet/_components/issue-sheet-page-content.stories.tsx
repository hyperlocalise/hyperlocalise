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
  issueSheetEmptyMswHandlers,
  issueSheetErrorMswHandlers,
  issueSheetLoadingMswHandlers,
  issueSheetMswHandlers,
} from "./issue-sheet-msw-handlers";
import { issueSheetOrganizationSlug, issueSheetProjectId } from "./issue-sheet.fixture";
import { IssueSheetPageContent } from "./issue-sheet-page-content";

const meta = {
  title: "App/Issues/Sheet",
  component: IssueSheetPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet`,
      },
    },
  },
  args: {
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
  },
} satisfies Meta<typeof IssueSheetPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Issues")).toBeInTheDocument();
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvas.getByText("Open")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Issue" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Column" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
    await expect(canvasElement.querySelector("table")).toBeNull();
    await expect(canvas.queryByText("3 total")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Owner note")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Context")).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: issueSheetLoadingMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Issues")).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: issueSheetEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No issues in this view.")).toBeInTheDocument();
    await expect(
      canvas.getByText("Add an issue manually or from CAT to start tracking team context."),
    ).toBeInTheDocument();
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: issueSheetErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Issues")).toBeInTheDocument();
    await expect(canvas.getByText("Issues could not be loaded.")).toBeInTheDocument();
    await expect(canvas.queryByText("No issues in this view.")).not.toBeInTheDocument();
  },
};
