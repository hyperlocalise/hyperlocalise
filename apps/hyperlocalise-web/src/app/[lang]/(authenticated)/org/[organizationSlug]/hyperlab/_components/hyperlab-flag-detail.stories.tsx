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
  hyperlabCheckoutFlag,
  hyperlabOrganizationSlug,
  hyperlabThemeFlag,
} from "./hyperlab.fixture";
import { hyperlabPopulatedMswHandlers } from "./hyperlab-msw-handlers";
import { HyperlabFlagDetail } from "./hyperlab-flag-detail";

const meta = {
  title: "App/Hyperlab/Flag Detail",
  component: HyperlabFlagDetail,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: hyperlabPopulatedMswHandlers,
    },
  },
  args: {
    organizationSlug: hyperlabOrganizationSlug,
    flagId: hyperlabCheckoutFlag.id,
    canWrite: true,
  },
} satisfies Meta<typeof HyperlabFlagDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UsedInATest: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/flags/${hyperlabCheckoutFlag.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "japan-checkout-cta" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("About this flag")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("japan-checkout-cta")).toBeDisabled();
    await expect(canvas.getByDisplayValue("Japan checkout button")).toBeInTheDocument();
    await expect(canvas.getByText("Used in")).toBeInTheDocument();
    await expect(
      await canvas.findByRole("link", { name: /Japan checkout headline/ }),
    ).toBeInTheDocument();
  },
};

export const AlwaysOn: Story = {
  args: {
    flagId: hyperlabThemeFlag.id,
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/flags/${hyperlabThemeFlag.id}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "homepage-theme" }),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("Always-on value")).toBeInTheDocument();
    await expect(canvas.getByText("Used in")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "This flag is not on any experiment yet. Add it from an experiment version.",
      ),
    ).toBeInTheDocument();
  },
};
