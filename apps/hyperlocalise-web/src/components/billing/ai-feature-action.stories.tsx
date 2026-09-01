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

import { Button } from "@/components/ui/button";

import { AiFeatureAction } from "./ai-feature-action";

const meta = {
  title: "App/Billing/AiFeatureAction",
  component: AiFeatureAction,
  args: {
    organizationSlug: "acme",
  },
} satisfies Meta<typeof AiFeatureAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Allowed: Story = {
  args: {
    children: <Button type="button">Translate with agent</Button>,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Translate with agent" })).toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Upgrade plan" })).not.toBeInTheDocument();
  },
};
