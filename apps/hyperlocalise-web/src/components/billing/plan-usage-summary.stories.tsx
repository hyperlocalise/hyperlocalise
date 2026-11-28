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
import { expect, within } from "storybook/test";

import type { ResolvedPlanUsageSummary } from "@/lib/billing/plan-usage";

import { PlanUsageSummaryContent } from "./plan-usage-summary";

function createSummary(
  overrides: Partial<ResolvedPlanUsageSummary> = {},
): ResolvedPlanUsageSummary {
  return {
    activePlanName: "Growth",
    isScheduledForCancel: false,
    renewalLabel: "Dec 28, 2026",
    renewalCopy: "Renews on Dec 28, 2026",
    usageSummary: "$42.10 / $100.00 AI credit used",
    usageProgressPercent: 42.1,
    unlimited: false,
    ...overrides,
  };
}

const meta = {
  title: "App/Billing/Plan usage summary",
  component: PlanUsageSummaryContent,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-96 rounded-lg border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
  args: { summary: createSummary() },
} satisfies Meta<typeof PlanUsageSummaryContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Growth")).toBeVisible();
    await expect(canvas.getByRole("progressbar")).toBeVisible();
  },
};

export const NearLimit: Story = {
  args: {
    summary: createSummary({
      usageSummary: "$96.40 / $100.00 AI credit used",
      usageProgressPercent: 96.4,
    }),
  },
};

export const OverLimit: Story = {
  args: {
    summary: createSummary({
      usageSummary: "$112.00 / $100.00 AI credit used",
      usageProgressPercent: 100,
    }),
  },
};

export const ScheduledForCancel: Story = {
  args: {
    summary: createSummary({
      isScheduledForCancel: true,
      renewalCopy: "Access until Dec 28, 2026",
    }),
  },
};

export const Unlimited: Story = {
  args: {
    summary: createSummary({
      activePlanName: "Enterprise",
      usageSummary: "Unlimited usage",
      usageProgressPercent: null,
      unlimited: true,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("progressbar")).not.toBeInTheDocument();
  },
};

export const NoActivePlan: Story = {
  args: {
    summary: createSummary({
      activePlanName: null,
      renewalLabel: null,
      renewalCopy: null,
      usageSummary: "$0.00 / $0.00 AI credit used",
      usageProgressPercent: null,
    }),
  },
};
