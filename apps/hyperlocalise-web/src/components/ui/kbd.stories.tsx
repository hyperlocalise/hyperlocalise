import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Kbd } from "./kbd";

const meta = {
  title: "UI/Kbd",
  component: Kbd,
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-3 p-6">
      <div className="flex items-center gap-1">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </div>
      <div className="flex items-center gap-1">
        <Kbd>G</Kbd>
        <Kbd>P</Kbd>
      </div>
      <Kbd>Esc</Kbd>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ctrl")).toHaveAttribute("data-slot", "kbd");
    await expect(canvas.getByText("K")).toHaveAttribute("data-slot", "kbd");
  },
};
