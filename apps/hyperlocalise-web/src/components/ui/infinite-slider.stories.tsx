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

import { Badge } from "./badge";
import { InfiniteSlider } from "./infinite-slider";

const meta = {
  title: "UI/Infinite Slider",
  component: InfiniteSlider,
} satisfies Meta<typeof InfiniteSlider>;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div className="max-w-xl p-6">
      <InfiniteSlider speed={60} speedOnHover={20}>
        {["French", "German", "Japanese", "Spanish", "Portuguese"].map((locale) => (
          <Badge key={locale} variant="secondary">
            {locale}
          </Badge>
        ))}
      </InfiniteSlider>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("French")[0]).toBeInTheDocument();
  },
};
