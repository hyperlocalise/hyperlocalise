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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PipesConnectionStatus } from "@/lib/pipes/types";

import { IntercomConnectionPanel } from "./intercom-connection-panel";

const mocks = vi.hoisted(() => ({
  status: {
    connected: false,
    needsReauthorization: false,
    apiKeyLast4: null,
  } as PipesConnectionStatus,
  isLoading: false,
  isError: false,
  authorizeGet: vi.fn(),
  disconnectDelete: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock("./pipes-connection-panel", () => ({
  usePipesStatus: () => ({
    data: mocks.status,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  createApiClient: () => ({
    api: {
      orgs: {
        ":organizationSlug": {
          pipes: {
            ":provider": {
              $delete: (...args: unknown[]) => mocks.disconnectDelete(...args),
              "authorize-url": {
                $get: (...args: unknown[]) => mocks.authorizeGet(...args),
              },
            },
          },
        },
      },
    },
  }),
}));

function renderPanel({ disabled = false }: { disabled?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <IntercomConnectionPanel organizationSlug="acme" disabled={disabled} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("IntercomConnectionPanel", () => {
  beforeEach(() => {
    mocks.status = {
      connected: false,
      needsReauthorization: false,
      apiKeyLast4: null,
    };
    mocks.isLoading = false;
    mocks.isError = false;
    mocks.authorizeGet.mockReset();
    mocks.disconnectDelete.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    window.location.href = "http://localhost/";
  });

  it("shows Connect for an admin when Intercom is disconnected", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("workos-pipes-widget")).not.toBeInTheDocument();
  });

  it("starts the WorkOS authorize flow from Connect", async () => {
    mocks.authorizeGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://api.workos.com/data-integrations/intercom/authorize-redirect",
      }),
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(window.location.href).toBe(
        "https://api.workos.com/data-integrations/intercom/authorize-redirect",
      );
    });
    expect(mocks.authorizeGet).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", provider: "intercom" },
    });
  });

  it("lets an admin expand Manage and disconnect", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };
    mocks.disconnectDelete.mockResolvedValue({ ok: true });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(screen.getByText("Connected · token ending in abcd")).toBeVisible();
    expect(screen.queryByTestId("workos-pipes-widget")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mocks.disconnectDelete).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", provider: "intercom" },
      });
    });
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Intercom disconnected.");
    });
  });

  it("keeps disconnected rows collapsed for read-only users", () => {
    renderPanel({ disabled: true });

    expect(screen.getByText("Admins can connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });

  it("hides mutation controls for connected read-only users", () => {
    mocks.status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };

    renderPanel({ disabled: true });

    expect(screen.getByText("Admins can connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });
});
