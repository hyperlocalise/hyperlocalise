import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Switch } from "./switch";

const meta = {
  title: "UI/Switch",
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-6 p-6">
      <Switch aria-label="Enable automated pull requests" defaultChecked />
      <Switch aria-label="Sync provider glossaries" />
      <Switch aria-label="Compact notification toggle" size="sm" defaultChecked />
      <Switch aria-label="Locked automation toggle" disabled />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole("switch", { name: /enable automated pull requests/i });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  },
};
