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

import { automationTemplatesFixture } from "./automations.fixture";
import { AutomationsCreatePageView } from "./automations-create-page-view";

const meta = {
  title: "App/Automations/Create",
  component: AutomationsCreatePageView,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/org/acme/automations/create",
        query: {},
      },
    },
  },
  args: {
    organizationSlug: "acme",
    templates: automationTemplatesFixture,
    assistant: { aiFeaturesStatus: "allowed", pending: false, onSubmitPrompt: () => {} },
    workflowAccess: "available",
    onCreateWorkflow: () => {},
  },
} satisfies Meta<typeof AutomationsCreatePageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "What should happen?" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: /^Agent/ })).toHaveAttribute(
      "href",
      "/org/acme/automations/new",
    );
    await expect(canvas.getByRole("button", { name: /^Workflow/ })).toBeInTheDocument();
    await expect(canvas.queryByText("Coming soon")).not.toBeInTheDocument();
  },
};

export const WorkflowNeedsUpgrade: Story = {
  args: { workflowAccess: "upgrade" },
};

export const WithoutAssistant: Story = {
  args: { assistant: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Build it yourself" })).toBeInTheDocument();
  },
};
