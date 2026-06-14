import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { memberDirectoryFixture } from "./teams.fixture";
import { AddTeamMemberDialog } from "./add-team-member-dialog";

const meta = {
  title: "App/Teams/AddMemberDialog",
  component: AddTeamMemberDialog,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    assignableMembers: memberDirectoryFixture,
    isSaving: false,
    onOpenChange: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof AddTeamMemberDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Add team member" })).toBeInTheDocument();
    await expect(canvas.getByText("sam@example.com")).toBeInTheDocument();
  },
};

export const NoAssignableMembers: Story = {
  args: {
    assignableMembers: [],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Everyone in this workspace is already on the team."),
    ).toBeInTheDocument();
  },
};

export const Saving: Story = {
  args: {
    isSaving: true,
  },
};
