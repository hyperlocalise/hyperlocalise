/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

const meta = {
  title: "UI/Hover Card",
  component: HoverCard,
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <HoverCard open>
      <HoverCardTrigger render={<Button variant="link" />}>@localization-team</HoverCardTrigger>
      <HoverCardContent>
        <div className="font-medium">Localization team</div>
        <p className="mt-1 text-muted-foreground">
          Owns glossary updates, reviewer assignment, and provider sync settings.
        </p>
      </HoverCardContent>
    </HoverCard>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Localization team")).toBeInTheDocument();
  },
};
