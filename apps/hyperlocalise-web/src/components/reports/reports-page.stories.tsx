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
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ReportsPage } from "./reports-page";
import { reportsOrganizationSlug } from "./reports.fixture";
import {
  reportsActivityErrorMswHandlers,
  reportsLoadingMswHandlers,
  reportsMemberMswHandlers,
  reportsMswHandlers,
} from "./reports-msw-handlers";

const pathname = `/org/${reportsOrganizationSlug}/reports`;

const meta = {
  title: "App/Reports/Page",
  component: ReportsPage,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname } },
    msw: { handlers: reportsMswHandlers },
  },
  args: { organizationSlug: reportsOrganizationSlug },
} satisfies Meta<typeof ReportsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Activity: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("48,210")).toBeInTheDocument();
    await expect(canvas.getAllByRole("tab")).toHaveLength(7);
  },
};

export const DatesPicker: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /^Dates Last 28 days/ }));
    // The popover draws outside the story's own element.
    const page = within(document.body);
    await expect(await page.findByRole("list", { name: "Ready-made ranges" })).toBeInTheDocument();
    await expect(page.getAllByRole("grid")).toHaveLength(2);
  },
};

export const AiUsage: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname, query: { tab: "ai", ai2: "model" } },
    },
  },
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "Breakdown" });
    await expect(within(table).getByText("openai/gpt-6-luna")).toBeInTheDocument();
    await expect(within(table).getAllByText("Own key")).toHaveLength(2);
  },
};

export const WordCountsByTask: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname, query: { tab: "words", group: "task", unit: "characters" } },
    },
  },
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "Word counts" });
    await expect(within(table).getByText("Help centre: billing articles")).toBeInTheDocument();
    await expect(within(table).getByText("No task (content editor)")).toBeInTheDocument();
  },
};

export const WordCountsByWeek: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname, query: { tab: "words", group: "week", per: "week" } },
    },
  },
  play: async ({ canvas }) => {
    const chart = await canvas.findByRole("region", { name: "Volume over time" });
    await expect(await within(chart).findByText("Help centre")).toBeInTheDocument();
    await expect(canvas.getByRole("table", { name: "Word counts" })).toBeInTheDocument();
  },
};

export const WordCountsByMatchBand: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname, query: { tab: "words", split: "band", per: "week" } },
    },
  },
  play: async ({ canvas }) => {
    const chart = await canvas.findByRole("region", { name: "Volume over time" });
    await expect(await within(chart).findByText("100% and repetitions")).toBeInTheDocument();
    const bands = canvas.getByRole("region", { name: "Match bands" });
    await expect(within(bands).getAllByRole("listitem")).toHaveLength(3);
  },
};

export const CostEstimate: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname, query: { tab: "estimate", tasks: "job_release,job_billing" } },
    },
  },
  play: async ({ canvas }) => {
    const table = await canvas.findByRole("table", { name: "Cost estimate" });
    await expect(within(table).getByText("No rate")).toBeInTheDocument();
  },
};

export const ManageRates: Story = {
  parameters: CostEstimate.parameters,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Manage rates" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("dialog", { name: "Manage rates" })).toBeInTheDocument();
    await waitFor(() =>
      expect(body.getAllByRole("textbox", { name: "Rate (USD)" })).toHaveLength(2),
    );
  },
};

export const Budgets: Story = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname, query: { tab: "budgets" } } },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Forecast over")).toBeInTheDocument();
  },
};

export const Member: Story = {
  parameters: { msw: { handlers: reportsMemberMswHandlers } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Source words")).toBeInTheDocument();
    await expect(canvas.getAllByRole("tab")).toHaveLength(3);
  },
};

export const Loading: Story = {
  parameters: { msw: { handlers: reportsLoadingMswHandlers } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const ActivityFailed: Story = {
  parameters: { msw: { handlers: reportsActivityErrorMswHandlers } },
  play: async ({ canvas }) => {
    await waitFor(
      async () => expect((await canvas.findAllByText("Try again")).length).toBeGreaterThan(0),
      { timeout: 15_000 },
    );
  },
};
