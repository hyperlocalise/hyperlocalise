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
import { expect, userEvent, within } from "storybook/test";

import { reportsOrganizationSlug } from "./reports.fixture";
import { reportsMemberMswHandlers, reportsMswHandlers } from "./reports-msw-handlers";
import { TaskReport } from "./task-report";

const meta = {
  title: "App/Reports/Task report",
  component: TaskReport,
  parameters: {
    nextjs: { appDirectory: true },
    msw: { handlers: reportsMswHandlers },
  },
  args: { organizationSlug: reportsOrganizationSlug, jobId: "job_release" },
} satisfies Meta<typeof TaskReport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCosts: Story = {
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "Task match analysis" });
    await expect(within(table).getByText("3,605")).toBeInTheDocument();
    await expect(canvas.getByText("Work started")).toBeInTheDocument();
  },
};

export const SetPricing: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Set pricing for the Review step" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("Pricing for the Review step")).toBeInTheDocument();
  },
};

export const Member: Story = {
  parameters: { msw: { handlers: reportsMemberMswHandlers } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Only your own entries are listed.")).toBeInTheDocument();
    await expect(canvas.queryByText("Task pricing")).not.toBeInTheDocument();
  },
};
