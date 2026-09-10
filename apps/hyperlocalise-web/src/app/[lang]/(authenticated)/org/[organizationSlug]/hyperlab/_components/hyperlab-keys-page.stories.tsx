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

import { hyperlabOrganizationSlug } from "./hyperlab.fixture";
import { hyperlabEmptyMswHandlers, hyperlabPopulatedMswHandlers } from "./hyperlab-msw-handlers";
import { HyperlabKeysPage } from "./hyperlab-keys-page";

const meta = {
  title: "App/Hyperlab/API Keys",
  component: HyperlabKeysPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/keys`,
      },
    },
    msw: {
      handlers: hyperlabPopulatedMswHandlers,
    },
  },
  args: {
    organizationSlug: hyperlabOrganizationSlug,
    canWrite: true,
  },
} satisfies Meta<typeof HyperlabKeysPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "API keys" })).toBeInTheDocument();
    await expect(canvas.getByText("Production website")).toBeInTheDocument();
    await expect(canvas.getByText("hlk_prod…")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New key" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: hyperlabEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No API keys yet")).toBeInTheDocument();
    await expect(
      canvas.getByText("Create a key when you are ready for your site to start reading tests."),
    ).toBeInTheDocument();
  },
};

export const CreateKey: Story = {
  parameters: {
    msw: {
      handlers: hyperlabEmptyMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByRole("button", { name: "New key" })).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "New key" })[0]!);
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "New API key" });
    await expect(dialog).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Staging website");
    await userEvent.click(within(dialog).getByRole("button", { name: "New key" }));
    await expect(
      await canvas.findByText("Copy this key now. You will not see it again."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("hlk_storybook_secret_once")).toBeInTheDocument();
  },
};
