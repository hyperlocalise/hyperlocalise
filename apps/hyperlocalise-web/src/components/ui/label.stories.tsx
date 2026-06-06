import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Label",
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2 p-6">
      <Label htmlFor="locale-name">Locale name</Label>
      <Input id="locale-name" defaultValue="French" />
      <div className="group" data-disabled="true">
        <Label htmlFor="locked-locale">Locked locale</Label>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Locale name")).toHaveAttribute("data-slot", "label");
  },
};
