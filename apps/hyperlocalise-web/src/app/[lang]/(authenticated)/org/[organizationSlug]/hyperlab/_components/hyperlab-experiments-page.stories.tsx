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
import {
  hyperlabEmptyMswHandlers,
  hyperlabErrorMswHandlers,
  hyperlabPopulatedMswHandlers,
} from "./hyperlab-msw-handlers";
import { HyperlabExperimentsPage } from "./hyperlab-experiments-page";

const meta = {
  title: "App/Hyperlab/Experiments",
  component: HyperlabExperimentsPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/experiments`,
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
} satisfies Meta<typeof HyperlabExperimentsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Experiments" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Japan checkout headline" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "France homepage banner" })).toBeInTheDocument();
    await expect(canvas.getByText("A/B test")).toBeInTheDocument();
    await expect(canvas.getByText("On or off")).toBeInTheDocument();
    await expect(canvas.getByText("On")).toBeInTheDocument();
    await expect(canvas.getByText("Draft")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New experiment" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: hyperlabEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No experiments yet")).toBeInTheDocument();
    await expect(
      canvas.getByText("Create a test, pick who sees it, then turn it on when you are ready."),
    ).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "New experiment" }).length).toBeGreaterThan(
      0,
    );
  },
};

export const ReadOnly: Story = {
  args: {
    canWrite: false,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Japan checkout headline" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "New experiment" })).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: hyperlabErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("We could not load this page. Try again."),
    ).toBeInTheDocument();
  },
};

export const CreateDialog: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByRole("button", { name: "New experiment" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "New experiment" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("dialog", { name: "New experiment" })).toBeInTheDocument();
    await expect(body.getByLabelText("Name")).toBeInTheDocument();
    await expect(body.getByText("Type")).toBeInTheDocument();
    await expect(body.getByLabelText("Start date")).toBeInTheDocument();
    await expect(body.getByLabelText("Start time")).toBeInTheDocument();
    await expect(
      body.getByText("Show a change to some visitors. Everyone else stays on the current site."),
    ).toBeInTheDocument();
  },
};
