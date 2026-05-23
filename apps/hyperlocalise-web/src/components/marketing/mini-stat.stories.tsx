import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MiniStat } from "./mini-stat";

const meta = {
  component: MiniStat,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof MiniStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JobsQueued: Story = {
  args: {
    label: "Jobs queued",
    value: "128",
  },
};

export const MarketsCovered: Story = {
  args: {
    label: "Markets covered",
    value: "42",
  },
};

export const AvgTurnaround: Story = {
  args: {
    label: "Avg turnaround",
    value: "6.2h",
  },
};
