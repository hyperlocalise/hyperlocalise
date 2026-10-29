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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";

const mocks = vi.hoisted(() => ({
  leavePreview: vi.fn(),
  leave: vi.fn(),
  finishLeavingWorkspaceAction: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: { member: { leavePreview: mocks.leavePreview, leave: mocks.leave } },
    loading: false,
  }),
}));
vi.mock("@/app/auth/leave-workspace/actions", () => ({
  finishLeavingWorkspaceAction: mocks.finishLeavingWorkspaceAction,
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

import { LeaveWorkspaceDialog } from "./leave-workspace-dialog";

const onClose = vi.fn();
const assign = vi.fn();

function renderDialog(props: { isOnlyWorkspace?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <LeaveWorkspaceDialog
          open
          organizationSlug="acme"
          organizationName="Acme Localization"
          isOnlyWorkspace={props.isOnlyWorkspace ?? false}
          onClose={onClose}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

const emptyPreview = {
  blockedReason: null,
  apiKeys: [],
  automations: [],
  apiKeyTotal: 0,
  automationTotal: 0,
};

describe("LeaveWorkspaceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leave.mockResolvedValue(undefined);
    mocks.finishLeavingWorkspaceAction.mockResolvedValue({ redirectTo: "/org/beta/dashboard" });
    vi.spyOn(window, "location", "get").mockReturnValue({ assign } as unknown as Location);
  });

  it("lists what stops working, then leaves and moves on", async () => {
    mocks.leavePreview.mockResolvedValue({
      blockedReason: null,
      apiKeys: [{ name: "CI key", keyPrefix: "hl_abcd1" }],
      automations: [{ id: "auto-1", name: "Weekly SEO check" }],
      apiKeyTotal: 1,
      automationTotal: 1,
    });
    renderDialog();

    expect(screen.getByRole("heading", { name: "Leave Acme Localization?" })).toBeTruthy();
    expect(await screen.findByText("This API key stops working:")).toBeTruthy();
    expect(screen.getByText("CI key")).toBeTruthy();
    expect(
      screen.getByText("This automation uses an account you connected and may stop working:"),
    ).toBeTruthy();
    expect(screen.getByText("Weekly SEO check")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Leave workspace" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/org/beta/dashboard"));
    expect(mocks.leave).toHaveBeenCalledWith("acme");
    expect(mocks.finishLeavingWorkspaceAction).toHaveBeenCalledWith("acme");
    expect((screen.getByRole("button", { name: "Leaving…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("goes to the dashboard when moving on after leaving fails", async () => {
    mocks.leavePreview.mockResolvedValue(emptyPreview);
    mocks.finishLeavingWorkspaceAction.mockRejectedValue(new Error("down"));
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Leave workspace" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByText("Could not leave the workspace. Try again.")).toBeNull();
  });

  it("moves on when the person already left in another tab", async () => {
    mocks.leavePreview.mockResolvedValue(emptyPreview);
    mocks.leave.mockRejectedValue(
      new GoSvcClientError({
        code: "organization_access_denied",
        message: "Organization access denied",
        status: 403,
      }),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Leave workspace" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/org/beta/dashboard"));
  });

  it("counts what a shortened list leaves out", async () => {
    mocks.leavePreview.mockResolvedValue({
      ...emptyPreview,
      apiKeys: [{ name: "CI key", keyPrefix: "hl_abcd1" }],
      apiKeyTotal: 53,
    });
    renderDialog();

    expect(await screen.findByText("These API keys stop working:")).toBeTruthy();
    expect(screen.getByText("and 52 more")).toBeTruthy();
  });

  it("says what happens after leaving the only workspace", async () => {
    mocks.leavePreview.mockResolvedValue(emptyPreview);
    renderDialog({ isOnlyWorkspace: true });

    expect(
      await screen.findByText(
        /This is your only workspace\. Afterwards you can create a new one or accept an invitation\./,
      ),
    ).toBeTruthy();
  });

  it("keeps Leave disabled until it knows what stops working", async () => {
    mocks.leavePreview.mockRejectedValueOnce(new Error("down")).mockResolvedValue(emptyPreview);
    renderDialog();

    expect(await screen.findByText("Could not check what changes when you leave.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Leave workspace" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Leave workspace" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it("tells the only admin to make someone else an admin first", async () => {
    mocks.leavePreview.mockResolvedValue({ ...emptyPreview, blockedReason: "last_admin" });
    renderDialog();

    expect(
      await screen.findByText(
        "You are the only admin of this workspace. Make another member an admin before you leave.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave workspace" })).toBeNull();
    expect(screen.getByRole("button", { name: "Manage members" }).getAttribute("href")).toBe(
      "/org/acme/members",
    );
  });

  it("explains when the last other admin left in the meantime", async () => {
    mocks.leavePreview.mockResolvedValue(emptyPreview);
    mocks.leave.mockRejectedValue(
      new GoSvcClientError({
        code: "last_admin_protected",
        message: "The workspace needs another admin who has accepted their invitation",
        status: 409,
      }),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Leave workspace" }));

    expect(
      await screen.findByText(
        "You are the only admin of this workspace. Make another member an admin before you leave.",
      ),
    ).toBeTruthy();
    expect(mocks.finishLeavingWorkspaceAction).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("says when leaving failed", async () => {
    mocks.leavePreview.mockResolvedValue(emptyPreview);
    mocks.leave.mockRejectedValue(new Error("down"));
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Leave workspace" }));

    expect(await screen.findByText("Could not leave the workspace. Try again.")).toBeTruthy();
    expect(mocks.finishLeavingWorkspaceAction).not.toHaveBeenCalled();
  });
});
