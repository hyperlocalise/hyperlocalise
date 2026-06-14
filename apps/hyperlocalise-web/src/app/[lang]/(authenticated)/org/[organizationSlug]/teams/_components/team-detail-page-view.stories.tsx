import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { createTeamDetail, memberDirectoryFixture } from "./teams.fixture";
import { TeamDetailPageView } from "./team-detail-page-view";

const team = createTeamDetail();

const meta = {
  title: "App/Teams/Detail",
  component: TeamDetailPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    team,
    canManageTeams: true,
    currentUserWorkosId: "user_001",
    memberDirectory: memberDirectoryFixture,
    isLoading: false,
    isAddMemberOpen: false,
    isAddingMember: false,
    isEditOpen: false,
    isSavingTeam: false,
    isRemovingMember: false,
    updatingMemberRoleId: null,
    removingMember: null,
    onAddMemberOpenChange: fn(),
    onEditOpenChange: fn(),
    onAddMember: fn(),
    onUpdateTeam: fn(),
    onUpdateMemberRole: fn(),
    onRemoveMember: fn(),
    onRemovingMemberChange: fn(),
  },
} satisfies Meta<typeof TeamDetailPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Localization" })).toBeInTheDocument();
    await expect(canvas.getByText("mina@example.com")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add member" })).toBeInTheDocument();
  },
};

export const ManagerWithoutAdminAccess: Story = {
  args: {
    canManageTeams: false,
    currentUserWorkosId: "user_001",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add member" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Edit team" })).not.toBeInTheDocument();
  },
};

export const ReadOnlyMember: Story = {
  args: {
    canManageTeams: false,
    currentUserWorkosId: "user_002",
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
  },
};

export const AddMemberDialogOpen: Story = {
  args: {
    isAddMemberOpen: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Add team member" })).toBeInTheDocument();
    await expect(canvas.getByText("sam@example.com")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    team: undefined,
    isLoading: true,
  },
};

export const LoadError: Story = {
  args: {
    team: undefined,
    error: new Error("Team not found."),
  },
};
