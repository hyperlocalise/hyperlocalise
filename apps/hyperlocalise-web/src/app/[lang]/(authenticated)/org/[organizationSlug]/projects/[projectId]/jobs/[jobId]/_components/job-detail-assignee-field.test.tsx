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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ assignableOwners: vi.fn(), patch: vi.fn() }));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: { job: { assignableOwners: mocks.assignableOwners } },
    loading: false,
  }),
}));
vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: { orgs: { ":organizationSlug": { jobs: { ":jobId": { $patch: mocks.patch } } } } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { NativeJobOwnerField } from "./job-detail-assignee-field";

function renderField(props: { ownerUserId: string | null; ownerTeamId: string | null }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <NativeJobOwnerField
          organizationSlug="acme"
          projectId="project_1"
          jobId="job_1"
          assigneeType={props.ownerUserId ? "user" : null}
          queryKey={["job", "acme", "project_1", "job_1"]}
          {...props}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the owner picker on a task", () => {
  it("gives a task to a vendor team and shows the team as its owner", async () => {
    mocks.assignableOwners.mockResolvedValue({
      members: [],
      teams: [{ id: "team_1", name: "Acme Agency" }],
    });
    mocks.patch.mockResolvedValue({
      status: 200,
      json: async () => ({ job: { ownerUserId: null, ownerTeamId: "team_1" } }),
    });

    renderField({ ownerUserId: null, ownerTeamId: null });
    const picker = await screen.findByRole("button", { name: "Select assignee" });
    await waitFor(() => expect(picker.hasAttribute("disabled")).toBe(false));
    fireEvent.click(picker);
    expect(await screen.findByText("Vendor teams")).toBeTruthy();
    fireEvent.click(screen.getByText("Acme Agency"));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", jobId: "job_1" },
        json: { ownerTeamId: "team_1" },
      }),
    );
    cleanup();

    renderField({ ownerUserId: null, ownerTeamId: "team_1" });
    const withTeam = await screen.findByRole("button", { name: "Select assignee" });
    await waitFor(() => expect(withTeam.textContent).toContain("Acme Agency"));
    cleanup();

    // Handed to a person in the team: the person shows, and the team stays ticked.
    mocks.assignableOwners.mockResolvedValue({
      members: [
        {
          userId: "user_2",
          workosUserId: "wos_2",
          email: "rita@agency.test",
          displayName: "Rita Lopez",
          avatarUrl: null,
          isCurrentUser: false,
        },
      ],
      teams: [{ id: "team_1", name: "Acme Agency" }],
    });
    renderField({ ownerUserId: "user_2", ownerTeamId: "team_1" });
    const handedOut = await screen.findByRole("button", { name: "Select assignee" });
    await waitFor(() => expect(handedOut.textContent).toContain("Rita Lopez"));
    fireEvent.click(handedOut);
    const team = await screen.findByRole("option", { name: /Acme Agency/ });
    expect(team.getAttribute("data-checked")).toBe("true");
  });
});
