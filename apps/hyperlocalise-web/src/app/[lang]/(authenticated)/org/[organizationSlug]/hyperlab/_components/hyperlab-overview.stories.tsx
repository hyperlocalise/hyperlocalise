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

import { hyperlabOrganizationSlug } from "./hyperlab.fixture";
import {
  hyperlabEmptyMswHandlers,
  hyperlabErrorMswHandlers,
  hyperlabPopulatedMswHandlers,
} from "./hyperlab-msw-handlers";
import { HyperlabOverview } from "./hyperlab-overview";

const meta = {
  title: "App/Hyperlab/Home",
  component: HyperlabOverview,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab`,
      },
    },
    msw: {
      handlers: hyperlabPopulatedMswHandlers,
    },
  },
  args: {
    organizationSlug: hyperlabOrganizationSlug,
  },
} satisfies Meta<typeof HyperlabOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Hyperlab" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Home", current: "page" })).toBeInTheDocument();
    await expect(await canvas.findAllByText("2 set up")).toHaveLength(3);
    await expect(canvas.getByText("Experiments", { selector: "a" })).toBeInTheDocument();
    await expect(canvas.getByText("How a test usually goes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "For your developer" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: hyperlabEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("None yet")).toBeInTheDocument();
    await expect(canvas.getAllByText("None yet")).toHaveLength(3);
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
    await expect(await canvas.findAllByText("Could not load")).toHaveLength(3);
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
};
