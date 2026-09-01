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

import { UpgradePlanButton } from "./upgrade-plan-button";

const meta = {
  title: "App/Billing/UpgradePlanButton",
  component: UpgradePlanButton,
  args: {
    organizationSlug: "acme",
  },
} satisfies Meta<typeof UpgradePlanButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Upgrade plan" });
    await expect(link).toBeInTheDocument();
    await expect(link).toHaveAttribute("href", "/org/acme/settings/billing#available-plans");
  },
};

export const GhostXs: Story = {
  args: {
    variant: "ghost",
    size: "xs",
    className: "gap-1.5 px-2",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Upgrade plan" })).toBeInTheDocument();
  },
};

export const OutlineXs: Story = {
  args: {
    variant: "outline",
    size: "xs",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Upgrade plan" })).toBeInTheDocument();
  },
};
