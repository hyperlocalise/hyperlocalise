import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { TextShimmer } from "./text-shimmer";

const meta = {
  title: "UI/Text Shimmer",
  component: TextShimmer,
} satisfies Meta<typeof TextShimmer>;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-6">
      <TextShimmer>Generating translations</TextShimmer>
      <TextShimmer as="h3" className="text-lg font-semibold" duration={3} spread={3}>
        Syncing provider glossary
      </TextShimmer>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Generating translations")).toBeInTheDocument();
  },
};
