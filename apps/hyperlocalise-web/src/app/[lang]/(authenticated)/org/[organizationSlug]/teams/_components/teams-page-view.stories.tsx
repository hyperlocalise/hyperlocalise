import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { teamsFixture } from "./teams.fixture";
import { TeamsPageView } from "./teams-page-view";

const meta = {
  title: "App/Teams/Page",
  component: TeamsPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    teams: teamsFixture,
    canManageTeams: true,
    isLoading: false,
    isCreateOpen: false,
    isCreating: false,
    editingTeam: null,
    isUpdatingTeam: false,
    deletingTeam: null,
    isDeletingTeam: false,
    onCreateOpenChange: fn(),
    onCreateTeam: fn(),
    onEditingTeamChange: fn(),
    onUpdateTeam: fn(),
    onDeletingTeamChange: fn(),
    onDeleteTeam: fn(),
  },
} satisfies Meta<typeof TeamsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Teams" })).toBeInTheDocument();
    await expect(canvas.getByText("Localization")).toBeInTheDocument();
    await expect(canvas.getByText("Marketing")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    teams: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    teams: [],
    isLoading: false,
  },
};

export const ReadOnly: Story = {
  args: {
    canManageTeams: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create team" })).not.toBeInTheDocument();
  },
};

export const CreateDialogOpen: Story = {
  args: {
    isCreateOpen: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Create team" })).toBeInTheDocument();
  },
};

export const EditDialogOpen: Story = {
  args: {
    editingTeam: teamsFixture[0],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Edit team" })).toBeInTheDocument();
  },
};

export const DeleteDialogOpen: Story = {
  args: {
    deletingTeam: teamsFixture[0],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Delete team" })).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    teams: [],
    error: new Error("The teams API returned a 500."),
  },
};
