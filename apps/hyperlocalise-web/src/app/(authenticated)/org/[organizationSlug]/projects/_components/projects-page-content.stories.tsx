import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ProjectsPageContent } from "./projects-page-content";

const meta = {
  component: ProjectsPageContent,
  tags: ["ai-generated", "needs-work"],
} satisfies Meta<typeof ProjectsPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    organizationSlug: "demo-org",
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/demo release/i)).toBeVisible();
    await expect(canvas.getByRole("button", { name: /create project/i })).toBeVisible();
  },
};
