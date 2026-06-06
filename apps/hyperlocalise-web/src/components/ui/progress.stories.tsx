import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Progress, ProgressLabel, ProgressValue } from "./progress";

const meta = {
  title: "UI/Progress",
  component: Progress,
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6 p-6">
      <Progress value={68}>
        <ProgressLabel>Translation coverage</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Progress value={100}>
        <ProgressLabel>Provider sync</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Progress value={0}>
        <ProgressLabel>QA findings resolved</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuenow", "68");
  },
};
