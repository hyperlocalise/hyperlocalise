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

import { ImageGenerationLoadingCard } from "./image-generation-loading-card";

const meta = {
  title: "UI/ImageGenerationLoadingCard",
  component: ImageGenerationLoadingCard,
  args: { width: 1024, height: 768 },
  decorators: [
    (Story) => (
      <div className="max-w-md p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageGenerationLoadingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simulated: Story = {
  play: async ({ canvas }) => {
    const progress = canvas.getByRole("progressbar");
    await expect(progress).toHaveAccessibleName("Generating image");
    await expect(canvas.getByText("1024 × 768")).toBeInTheDocument();
  },
};

export const Controlled: Story = {
  args: { progress: 45 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
    await expect(canvas.getByText("45%")).toBeInTheDocument();
  },
};

export const Portrait: Story = {
  args: { width: 768, height: 1024, progress: 75 },
};

export const UnknownDimensions: Story = {
  args: { width: undefined, height: undefined },
};
