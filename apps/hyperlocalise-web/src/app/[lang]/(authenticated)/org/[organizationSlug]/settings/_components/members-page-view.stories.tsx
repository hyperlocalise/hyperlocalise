/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import type { OrganizationMembershipRole } from "@/lib/database/types";

import { MembersPageView } from "./members-page-view";
import type { MembersListMember } from "./members-settings-view-model";

function createMember(overrides: Partial<MembersListMember> = {}): MembersListMember {
  return {
    workosUserId: "user_001",
    email: "mina@example.com",
    displayName: "Mina Chen",
    avatarUrl: null,
    role: "reviewer",
    isCurrentUser: false,
    status: "active",
    canUpdateRole: true,
    canRemove: true,
    ...overrides,
  };
}

const assignableRoles: OrganizationMembershipRole[] = [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
];

const mina = createMember();
const otto = createMember({
  workosUserId: "user_002",
  email: "otto@example.com",
  displayName: "Otto Park",
  role: "member",
});
const currentUser = createMember({
  workosUserId: "user_003",
  email: "you@example.com",
  displayName: "You",
  role: "admin",
  isCurrentUser: true,
  canUpdateRole: false,
  canRemove: false,
});

const meta = {
  title: "App/Members/Page",
  component: MembersPageView,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: "/org/acme/members",
      },
    },
  },
  args: {
    organizationSlug: "acme",
    members: [currentUser, mina, otto],
    assignableRoles,
    canInvite: true,
    isLoading: false,
    loadError: null,
    isInviteOpen: false,
    inviteEmail: "",
    inviteRole: "member",
    isInviting: false,
    removingMember: null,
    isRemoving: false,
    editingMember: null,
    isUpdatingRole: false,
    onInviteOpenChange: fn(),
    onInviteEmailChange: fn(),
    onInviteRoleChange: fn(),
    onInviteSubmit: fn(),
    onRemovingMemberChange: fn(),
    onRemoveMember: fn(),
    onEditingMemberChange: fn(),
    onUpdateRole: fn(),
  },
} satisfies Meta<typeof MembersPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Members" })).toBeInTheDocument();
    await expect(canvas.getByText("Mina Chen")).toBeInTheDocument();
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Actions for Mina Chen" })).toBeInTheDocument();
  },
};

export const ChangeRoleDialogOpen: Story = {
  args: {
    editingMember: mina,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "Change role" })).toBeInTheDocument();
    await expect(
      canvas.getByText("Choose a new workspace role for Mina Chen."),
    ).toBeInTheDocument();
  },
};

export const OpensChangeRoleFromMenu: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Mina Chen" }));
    await userEvent.click(await canvas.findByText("Change role..."));
    await expect(args.onEditingMemberChange).toHaveBeenCalledWith(mina);
  },
};
