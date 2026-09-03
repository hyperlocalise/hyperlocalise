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

import { createTeamDetail, createTeamMember, memberDirectoryFixture } from "./teams.fixture";
import { TeamDetailPageView } from "./team-detail-page-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/teams/11111111-1111-4111-8111-111111111111",
}));

function renderWithIntl(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

function renderTeamDetail(overrides: Partial<Parameters<typeof TeamDetailPageView>[0]> = {}) {
  const props = {
    organizationSlug: "acme",
    team: createTeamDetail(),
    canManageTeams: true,
    currentUserWorkosId: "user_001",
    memberDirectory: memberDirectoryFixture,
    isLoading: false,
    isAddMemberOpen: false,
    isAddingMember: false,
    isEditOpen: false,
    isSavingTeam: false,
    isRemovingMember: false,
    isUpdatingMemberRole: false,
    editingMember: null,
    removingMember: null,
    onAddMemberOpenChange: vi.fn(),
    onEditOpenChange: vi.fn(),
    onAddMember: vi.fn(),
    onUpdateTeam: vi.fn(),
    onUpdateMemberRole: vi.fn(),
    onEditingMemberChange: vi.fn(),
    onRemoveMember: vi.fn(),
    onRemovingMemberChange: vi.fn(),
    ...overrides,
  };

  return { ...renderWithIntl(<TeamDetailPageView {...props} />), props };
}

describe("TeamDetailPageView", () => {
  it("shows team roles as badges instead of inline selects", () => {
    renderTeamDetail();

    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getAllByText("Member").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens the change-role dialog from the row actions menu", async () => {
    const user = userEvent.setup();
    const member = createTeamMember({
      workosUserId: "user_002",
      email: "otto@example.com",
      role: "member",
    });
    const { props } = renderTeamDetail();

    await user.click(screen.getByRole("button", { name: "Actions for otto@example.com" }));
    await user.click(await screen.findByText("Change role..."));

    expect(props.onEditingMemberChange).toHaveBeenCalledWith(member);
  });

  it("updates the team role only after confirming in the dialog", async () => {
    const user = userEvent.setup();
    const member = createTeamMember({
      workosUserId: "user_002",
      email: "otto@example.com",
      role: "member",
    });
    const { props } = renderTeamDetail({ editingMember: member });

    expect(screen.getByRole("dialog", { name: "Change role" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update role" })).toBeDisabled();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Manager" }));
    await user.click(screen.getByRole("button", { name: "Update role" }));

    expect(props.onUpdateMemberRole).toHaveBeenCalledWith({
      workosUserId: member.workosUserId,
      role: "manager",
    });
  });
});
