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

import {
  hyperlabAbExperiment,
  hyperlabOrganizationSlug,
  hyperlabToggleExperiment,
} from "./hyperlab.fixture";
import { hyperlabPopulatedMswHandlers } from "./hyperlab-msw-handlers";
import { HyperlabExperimentDetail } from "./hyperlab-experiment-detail";

const meta = {
  title: "App/Hyperlab/Experiment Detail",
  component: HyperlabExperimentDetail,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
    msw: {
      handlers: hyperlabPopulatedMswHandlers,
    },
  },
  args: {
    organizationSlug: hyperlabOrganizationSlug,
    experimentId: hyperlabAbExperiment.id,
    canWrite: true,
  },
} satisfies Meta<typeof HyperlabExperimentDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AbTest: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/experiments/${hyperlabAbExperiment.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Japan checkout headline" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Name and schedule")).toBeInTheDocument();
    await expect(canvas.getByText("Who sees it, and how many")).toBeInTheDocument();
    await expect(canvas.getByText("How traffic is split")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("Japan checkout headline")).toBeInTheDocument();
    await expect(await canvas.findByText("Visitors in Japan")).toBeInTheDocument();
    await expect(canvas.getAllByText("Original").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("new-headline").length).toBeGreaterThan(0);
    await expect(canvas.getByText("japan-checkout-cta")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add version" })).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Add flag" }).length).toBeGreaterThan(0);
  },
};

export const Toggle: Story = {
  args: {
    experimentId: hyperlabToggleExperiment.id,
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/experiments/${hyperlabToggleExperiment.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "France homepage banner" }),
    ).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("France homepage banner")).toBeInTheDocument();
    await expect(canvas.getAllByText("Draft").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Original").length).toBeGreaterThan(0);
    await expect(canvas.queryByText("How traffic is split")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add version" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  },
};
