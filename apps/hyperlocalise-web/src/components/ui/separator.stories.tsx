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

import { Separator } from "./separator";

const meta = {
  title: "UI/Separator",
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <div>Source strings</div>
      <Separator />
      <div className="flex h-20 items-center gap-4">
        <span>Draft</span>
        <Separator orientation="vertical" />
        <span>Review</span>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Source strings")).toBeInTheDocument();
  },
};
