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
import { HyperlabFlagsPage } from "./hyperlab-flags-page";

const meta = {
  title: "App/Hyperlab/Flags",
  component: HyperlabFlagsPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/flags`,
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
} satisfies Meta<typeof HyperlabFlagsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Flags" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "japan-checkout-cta" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "homepage-theme" })).toBeInTheDocument();
    await expect(canvas.getByText("Used in a test")).toBeInTheDocument();
    await expect(canvas.getByText("Always-on setting")).toBeInTheDocument();
    await expect(canvas.getByText("Japan checkout button")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New flag" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: hyperlabEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No flags yet")).toBeInTheDocument();
    await expect(
      canvas.getByText("Create a flag for the headline, button, or checkout you want to try."),
    ).toBeInTheDocument();
  },
};

export const CreateDialog: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByRole("button", { name: "New flag" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "New flag" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("dialog", { name: "New flag" })).toBeInTheDocument();
    await expect(body.getByLabelText("Name on the site")).toBeInTheDocument();
    await expect(body.getByText("How you will use it")).toBeInTheDocument();
  },
};
