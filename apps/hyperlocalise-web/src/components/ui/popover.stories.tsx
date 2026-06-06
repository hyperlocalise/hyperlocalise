import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

const meta = {
  title: "UI/Popover",
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger render={<Button variant="outline" />}>Show sync details</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Provider sync</PopoverTitle>
          <PopoverDescription>
            Last completed 2 minutes ago with 186 updated strings.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Provider sync")).toBeInTheDocument();
  },
};
