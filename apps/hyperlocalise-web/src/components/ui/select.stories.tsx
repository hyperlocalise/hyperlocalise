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

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta = {
  title: "UI/Select",
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex gap-4 p-6">
      <Select defaultValue="fr" open>
        <SelectTrigger aria-label="Target locale">
          <SelectValue placeholder="Select locale" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Locales</SelectLabel>
            <SelectItem value="fr">French</SelectItem>
            <SelectItem value="de">German</SelectItem>
            <SelectSeparator />
            <SelectItem value="ja">Japanese</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select defaultValue="review">
        <SelectTrigger aria-label="Job status" size="sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="review">In review</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("French")).toBeInTheDocument();
  },
};
