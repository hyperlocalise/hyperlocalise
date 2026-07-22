/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Spinner } from "./spinner";

const meta = {
  title: "UI/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-4 p-6">
      <Spinner />
      <Spinner className="size-6" />
      <Spinner className="size-8 text-primary" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("status")[0]).toHaveAccessibleName("Loading");
  },
};
