import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";

const meta = {
  component: Badge,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Active",
  },
};

export const Secondary: Story = {
  args: {
    children: "Draft",
    variant: "secondary",
  },
};

export const Destructive: Story = {
  args: {
    children: "Failed",
    variant: "destructive",
  },
};

export const Outline: Story = {
  args: {
    children: "External TMS",
    variant: "outline",
  },
};
