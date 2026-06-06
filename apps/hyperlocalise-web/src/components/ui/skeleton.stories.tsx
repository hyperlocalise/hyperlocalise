import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Skeleton } from "./skeleton";

const meta = {
  title: "UI/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3 p-6" aria-label="Loading translation summary">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-24 w-full" />
      <div className="flex gap-2">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Loading translation summary")).toBeInTheDocument();
  },
};
