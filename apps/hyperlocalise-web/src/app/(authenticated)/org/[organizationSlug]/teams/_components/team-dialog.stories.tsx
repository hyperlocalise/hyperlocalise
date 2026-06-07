import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { createEmptyTeamForm, createTeamFormFromSummary } from "./team-form";
import { createTeamSummary } from "./teams.fixture";
import { TeamDialog } from "./team-dialog";

const meta = {
  title: "App/Teams/TeamDialog",
  component: TeamDialog,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    isSaving: false,
    onOpenChange: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof TeamDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  args: {
    mode: "create",
    title: "Create team",
    description: "Teams group workspace members and scope which projects they can access.",
    initialValues: createEmptyTeamForm(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Create team" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Name")).toBeInTheDocument();
  },
};

export const Edit: Story = {
  args: {
    mode: "edit",
    title: "Edit team",
    description: "Update the team name or slug used for project scoping.",
    initialValues: createTeamFormFromSummary(createTeamSummary()),
  },
};

export const Saving: Story = {
  args: {
    mode: "create",
    title: "Create team",
    description: "Teams group workspace members and scope which projects they can access.",
    initialValues: createEmptyTeamForm(),
    isSaving: true,
  },
};
