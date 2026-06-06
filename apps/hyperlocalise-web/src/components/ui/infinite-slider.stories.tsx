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
