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
import { HyperlabAudiencesPage } from "./hyperlab-audiences-page";

const meta = {
  title: "App/Hyperlab/Audiences",
  component: HyperlabAudiencesPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/audiences`,
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
} satisfies Meta<typeof HyperlabAudiencesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Audiences" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Visitors in Japan" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Paid plans" })).toBeInTheDocument();
    await expect(canvas.getByText("Country is JP")).toBeInTheDocument();
    await expect(canvas.getByText("Plan is pro")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New audience" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: hyperlabEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No audiences yet")).toBeInTheDocument();
    await expect(
      canvas.getByText("Create a group, then reuse it on any experiment."),
    ).toBeInTheDocument();
  },
};

export const CreateDialog: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByRole("button", { name: "New audience" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "New audience" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("dialog", { name: "New audience" })).toBeInTheDocument();
    await expect(body.getByLabelText("Name")).toBeInTheDocument();
    await expect(body.getByLabelText("Note")).toBeInTheDocument();
    await expect(
      body.getByText("Name the group. You will add the rules on the next screen."),
    ).toBeInTheDocument();
  },
};
