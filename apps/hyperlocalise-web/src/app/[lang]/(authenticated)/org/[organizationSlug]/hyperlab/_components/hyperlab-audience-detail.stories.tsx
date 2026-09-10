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

import { hyperlabJapanAudience, hyperlabOrganizationSlug } from "./hyperlab.fixture";
import { hyperlabPopulatedMswHandlers } from "./hyperlab-msw-handlers";
import { HyperlabAudienceDetail } from "./hyperlab-audience-detail";

const meta = {
  title: "App/Hyperlab/Audience Detail",
  component: HyperlabAudienceDetail,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${hyperlabOrganizationSlug}/hyperlab/audiences/${hyperlabJapanAudience.id}`,
      },
    },
    msw: {
      handlers: hyperlabPopulatedMswHandlers,
    },
  },
  args: {
    organizationSlug: hyperlabOrganizationSlug,
    audienceId: hyperlabJapanAudience.id,
    canWrite: true,
  },
} satisfies Meta<typeof HyperlabAudienceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Visitors in Japan" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("Who is in this group")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("Visitors in Japan")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("People browsing from Japan")).toBeInTheDocument();
    await expect(canvas.getByText("Visitor detail")).toBeInTheDocument();
    await expect(canvas.getByText("Match")).toBeInTheDocument();
    await expect(canvas.getByDisplayValue("JP")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add rule" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};
