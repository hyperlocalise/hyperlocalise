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
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  storeActiveOrganizationSlugAction: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: { workspace: { update: mocks.update } },
    loading: false,
  }),
}));
vi.mock("./workspace-settings-actions", () => ({
  storeActiveOrganizationSlugAction: mocks.storeActiveOrganizationSlugAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { WorkspaceSettingsForm } from "./workspace-settings-form";

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <WorkspaceSettingsForm canUpdateWorkspace organizationName="Acme" organizationSlug="acme" />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("WorkspaceSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storeActiveOrganizationSlugAction.mockResolvedValue(undefined);
  });

  it("saves through go-svc, then stores the slug cookie and redirects", async () => {
    mocks.update.mockResolvedValue({
      workspace: { name: "Acme Localization", slug: "acme-localization" },
      redirectTo: "/org/acme-localization/settings/account",
    });
    renderForm();

    await userEvent.clear(screen.getByLabelText("Organization name"));
    await userEvent.type(screen.getByLabelText("Organization name"), "Acme Localization");
    await userEvent.clear(screen.getByLabelText("Workspace slug"));
    await userEvent.type(screen.getByLabelText("Workspace slug"), "acme-localization");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/org/acme-localization/settings/account"),
    );
    expect(mocks.update).toHaveBeenCalledWith("acme", {
      name: "Acme Localization",
      slug: "acme-localization",
    });
    expect(mocks.storeActiveOrganizationSlugAction).toHaveBeenCalledWith("acme-localization");
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("still redirects when the cookie write fails", async () => {
    mocks.update.mockResolvedValue({
      workspace: { name: "Acme Localization", slug: "acme-localization" },
      redirectTo: "/org/acme-localization/settings/account",
    });
    mocks.storeActiveOrganizationSlugAction.mockRejectedValue(new Error("down"));
    renderForm();

    await userEvent.clear(screen.getByLabelText("Workspace slug"));
    await userEvent.type(screen.getByLabelText("Workspace slug"), "acme-localization");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/org/acme-localization/settings/account"),
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("shows the go-svc error when the update is refused", async () => {
    mocks.update.mockRejectedValue(
      new GoSvcClientError({
        code: "workspace_slug_conflict",
        message: "Workspace slug already exists",
        status: 409,
      }),
    );
    renderForm();

    await userEvent.clear(screen.getByLabelText("Workspace slug"));
    await userEvent.type(screen.getByLabelText("Workspace slug"), "taken");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Workspace slug already exists"),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
