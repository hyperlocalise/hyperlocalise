import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Input } from "./input";

const meta = {
  component: Input,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Search by name or ID...",
    "aria-label": "Search projects",
  },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByLabelText(/search projects/i);
    await userEvent.type(field, "demo", { delay: 20 });
    await expect(field).toHaveValue("demo");
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Project name",
    disabled: true,
    value: "Demo Release",
    readOnly: true,
  },
};

export const Invalid: Story = {
  args: {
    placeholder: "API key label",
    "aria-invalid": true,
    defaultValue: "",
  },
};
