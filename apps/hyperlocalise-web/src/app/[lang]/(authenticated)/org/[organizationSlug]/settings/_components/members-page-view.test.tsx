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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import type { OrganizationMembershipRole } from "@/lib/database/types";

import { MembersPageView } from "./members-page-view";
import type { MembersListMember } from "./members-settings-view-model";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/members",
}));

function renderWithIntl(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

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

function renderMembersPage(overrides: Partial<Parameters<typeof MembersPageView>[0]> = {}) {
  const props: Parameters<typeof MembersPageView>[0] = {
    organizationSlug: "acme",
    members: [createMember()],
    assignableRoles,
    canInvite: true,
    isLoading: false,
    loadError: null,
    isInviteOpen: false,
    inviteEmail: "",
    inviteRole: "member" as const,
    inviteTeams: [
      {
        id: "team-default",
        slug: "default",
        name: "Default team",
        memberCount: 1,
        currentUserRole: "manager",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    inviteTeamId: "team-default",
    inviteRequiresTeam: true,
    isLoadingTeams: false,
    teamsLoadError: null,
    isInviting: false,
    removingMember: null,
    isRemoving: false,
    editingMember: null,
    isUpdatingRole: false,
    onInviteOpenChange: vi.fn(),
    onInviteEmailChange: vi.fn(),
    onInviteRoleChange: vi.fn(),
    onInviteTeamIdChange: vi.fn(),
    onInviteSubmit: vi.fn(),
    onRemovingMemberChange: vi.fn(),
    onRemoveMember: vi.fn(),
    onEditingMemberChange: vi.fn(),
    onUpdateRole: vi.fn(),
    ...overrides,
  };

  return { ...renderWithIntl(<MembersPageView {...props} />), props };
}

describe("MembersPageView", () => {
  it("shows role as a badge instead of an inline select", () => {
    renderMembersPage();

    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("keeps the row actions trigger visible without requiring hover", () => {
    renderMembersPage();

    const trigger = screen.getByRole("button", { name: "Actions for Mina Chen" });
    expect(trigger).toBeVisible();
    expect(trigger.className).not.toMatch(/opacity-0/);
  });

  it("opens the change-role dialog from the row actions menu", async () => {
    const user = userEvent.setup();
    const member = createMember();
    const { props } = renderMembersPage({ members: [member] });

    await user.click(screen.getByRole("button", { name: "Actions for Mina Chen" }));
    await user.click(await screen.findByText("Change role..."));

    expect(props.onEditingMemberChange).toHaveBeenCalledWith(member);
  });

  it("updates the role only after confirming in the dialog", async () => {
    const user = userEvent.setup();
    const member = createMember();
    const { props } = renderMembersPage({
      members: [member],
      editingMember: member,
    });

    expect(screen.getByRole("dialog", { name: "Change role" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update role" })).toBeDisabled();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Admin/ }));
    await user.click(screen.getByRole("button", { name: "Update role" }));

    expect(props.onUpdateRole).toHaveBeenCalledWith({
      workosUserId: member.workosUserId,
      role: "admin",
    });
  });

  it("removes a member from the row actions menu instead of a standalone icon", async () => {
    const user = userEvent.setup();
    const member = createMember();
    const { props } = renderMembersPage({ members: [member] });

    expect(screen.queryByRole("button", { name: "Remove Mina Chen" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions for Mina Chen" }));
    await user.click(await screen.findByText("Remove member..."));

    expect(props.onRemovingMemberChange).toHaveBeenCalledWith(member);
  });

  it("shows the team selector in the invite dialog for non-operator roles", () => {
    renderMembersPage({ isInviteOpen: true });

    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Default team")).toBeInTheDocument();
    expect(
      screen.getByText("Invited members are added to this team so they can access projects."),
    ).toBeInTheDocument();
  });

  it("hides the team selector when inviting an operator role", () => {
    renderMembersPage({
      isInviteOpen: true,
      inviteRole: "admin",
      inviteRequiresTeam: false,
    });

    expect(screen.queryByText("Team")).not.toBeInTheDocument();
  });

  it("hides the actions menu when the member cannot be managed", () => {
    renderMembersPage({
      members: [
        createMember({
          isCurrentUser: true,
          canUpdateRole: false,
          canRemove: false,
        }),
      ],
    });

    expect(screen.queryByRole("button", { name: "Actions for Mina Chen" })).not.toBeInTheDocument();
  });
});
