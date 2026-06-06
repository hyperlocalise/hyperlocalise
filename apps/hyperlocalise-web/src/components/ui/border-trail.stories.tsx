import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { BorderTrail } from "./border-trail";

const meta = {
  title: "UI/Border Trail",
  component: BorderTrail,
} satisfies Meta<typeof BorderTrail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="relative max-w-sm overflow-hidden rounded-3xl border bg-card p-6">
      <BorderTrail className="bg-primary" />
      <h3 className="font-semibold">Sync in progress</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Animated border trail with default size and a primary color override.
      </p>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Sync in progress")).toBeInTheDocument();
  },
};
