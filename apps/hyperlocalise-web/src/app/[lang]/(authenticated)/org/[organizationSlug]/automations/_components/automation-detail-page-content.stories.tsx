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

import { createAutomationSummary } from "./automations.fixture";
import { AutomationDetailPageContent } from "./automation-detail-page-content";
import { createAutomationDetailMswHandlers } from "./automation-msw-handlers";

const githubAutomation = createAutomationSummary();
const scheduledAutomation = createAutomationSummary({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Weekly translation sync",
  triggerConfig: {
    mode: "scheduled",
    schedule: {
      cadence: "weekly",
      hourUtc: 9,
      dayOfWeek: 1,
      timezone: "UTC",
    },
  },
});
const manualAutomation = createAutomationSummary({
  id: "44444444-4444-4444-8444-444444444444",
  name: "Manual release checklist",
  triggerConfig: { mode: "manual" },
});

const meta = {
  title: "App/Automations/Detail",
  component: AutomationDetailPageContent,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    automationId: githubAutomation.id,
  },
} satisfies Meta<typeof AutomationDetailPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GithubTriggerHidesRun: Story = {
  parameters: {
    msw: {
      handlers: createAutomationDetailMswHandlers(githubAutomation),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/automations/${githubAutomation.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByDisplayValue("Validate localisation on push"),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Delete" })).toBeEnabled();
    await expect(canvas.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  },
};

export const DeleteConfirmsRemoval: Story = {
  parameters: {
    msw: {
      handlers: createAutomationDetailMswHandlers(githubAutomation),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/automations/${githubAutomation.id}`,
      },
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Delete" }));
    const dialog = body.getByRole("alertdialog", { name: "Delete automation?" });
    await expect(dialog).toBeInTheDocument();
    await expect(
      within(dialog).getByText(
        "Validate localisation on push will be removed from this workspace and will no longer run.",
      ),
    ).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    await expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  },
};

export const ScheduledTriggerShowsRun: Story = {
  args: {
    automationId: scheduledAutomation.id,
  },
  parameters: {
    msw: {
      handlers: createAutomationDetailMswHandlers(scheduledAutomation),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/automations/${scheduledAutomation.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByDisplayValue("Weekly translation sync")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run now" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};

export const ManualTriggerShowsRun: Story = {
  args: {
    automationId: manualAutomation.id,
  },
  parameters: {
    msw: {
      handlers: createAutomationDetailMswHandlers(manualAutomation),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/automations/${manualAutomation.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByDisplayValue("Manual release checklist")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run now" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
  },
};

export const SaveEnablesAfterFormChange: Story = {
  args: {
    automationId: scheduledAutomation.id,
  },
  parameters: {
    msw: {
      handlers: createAutomationDetailMswHandlers(scheduledAutomation),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/automations/${scheduledAutomation.id}`,
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    const nameInput = await canvas.findByDisplayValue("Weekly translation sync");
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Nightly translation sync");
    await expect(canvas.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Run now" })).toBeInTheDocument();
  },
};
