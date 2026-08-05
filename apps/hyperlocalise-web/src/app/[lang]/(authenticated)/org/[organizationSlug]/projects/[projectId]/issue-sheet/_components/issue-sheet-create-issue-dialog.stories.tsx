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
import { expect, fn } from "storybook/test";

import { IssueSheetCreateIssueDialog } from "./issue-sheet-create-issue-dialog";
import { issueSheetMswHandlers } from "./issue-sheet-msw-handlers";
import {
  issueSheetOrganizationSlug,
  issueSheetProjectFixture,
  issueSheetProjectId,
} from "./issue-sheet.fixture";

const projects = [
  { id: issueSheetProjectFixture.id, name: issueSheetProjectFixture.name },
  { id: "project_mobile", name: "Mobile app" },
];

const meta = {
  title: "App/Issues/Create Dialog",
  component: IssueSheetCreateIssueDialog,
  parameters: {
    layout: "centered",
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  args: {
    open: true,
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
    projects,
    onOpenChange: fn(),
    onCreated: fn(async () => {}),
  },
} satisfies Meta<typeof IssueSheetCreateIssueDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectScoped: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Add issue" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Title")).toBeInTheDocument();
    await expect(canvas.queryByText("Project")).not.toBeInTheDocument();
  },
};

export const OrganizationScoped: Story = {
  args: {
    projectId: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Add issue" })).toBeInTheDocument();
    await expect(canvas.getByText("Project")).toBeInTheDocument();
    await expect(canvas.getByText("Select a project")).toBeInTheDocument();
  },
};
