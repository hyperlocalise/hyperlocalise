import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-4 p-6">
      <Input aria-label="Project name" placeholder="Marketing site" />
      <Input aria-label="Repository URL" defaultValue="github.com/acme/web" />
      <Input aria-invalid aria-label="Provider token" defaultValue="expired-token" />
      <Input aria-label="Locked slug" disabled defaultValue="production-workspace" />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText("Project name");
    await userEvent.type(input, "Mobile app");
    await expect(input).toHaveValue("Mobile app");
  },
};
