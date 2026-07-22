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

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const meta = {
  title: "UI/Tooltip",
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger render={<Button variant="outline" />}>Hover for details</TooltipTrigger>
        <TooltipContent side="bottom">
          Syncs source strings from the connected provider.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Hover for details")).toBeInTheDocument();
  },
};
