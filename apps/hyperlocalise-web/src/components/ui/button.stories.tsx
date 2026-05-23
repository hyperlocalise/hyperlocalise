import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Button } from "./button";

const meta = {
  component: Button,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: "Create project",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /create project/i }),
    ).toHaveAttribute("data-slot", "button");
  },
};

export const Outline: Story = {
  args: {
    children: "Cancel",
    variant: "outline",
  },
};

export const Destructive: Story = {
  args: {
    children: "Delete",
    variant: "destructive",
  },
};

export const Large: Story = {
  args: {
    children: "Save changes",
    size: "lg",
  },
};

export const CssCheck: Story = {
  args: {
    children: "Submit",
    variant: "default",
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /submit/i });
    await expect(getComputedStyle(button).backgroundColor).toBe("oklch(0.922 0 0)");
  },
};
