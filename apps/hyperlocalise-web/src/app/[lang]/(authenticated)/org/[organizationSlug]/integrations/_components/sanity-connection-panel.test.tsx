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

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PipesConnectionStatus } from "@/lib/pipes/types";

import { SanityConnectionPanel } from "./sanity-connection-panel";

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
  projectsGet: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAccessToken: () => ({
    getAccessToken: async () => "test-access-token",
    loading: false,
  }),
}));

vi.mock("@workos-inc/widgets", () => ({
  WorkOsWidgets: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pipes: () => <div data-testid="workos-pipes-widget">Sanity Pipes widget</div>,
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
          sanity: {
            projects: {
              $get: (...args: unknown[]) => mocks.projectsGet(...args),
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
        <SanityConnectionPanel organizationSlug="acme" disabled={disabled} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("SanityConnectionPanel", () => {
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
    mocks.projectsGet.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    window.location.href = "http://localhost/";
  });

  it("shows OAuth and API token options when Connect is expanded", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText(
        "Connect with OAuth or an API token through WorkOS Pipes. Use whichever method your Sanity project supports.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authorize with Sanity" })).toBeEnabled();
    expect(screen.getByTestId("workos-pipes-widget")).toBeInTheDocument();
  });

  it("starts the WorkOS authorize flow from Authorize with Sanity", async () => {
    mocks.authorizeGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://api.workos.com/data-integrations/sanity/authorize-redirect",
      }),
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Authorize with Sanity" }));

    await waitFor(() => {
      expect(window.location.href).toBe(
        "https://api.workos.com/data-integrations/sanity/authorize-redirect",
      );
    });
    expect(mocks.authorizeGet).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", provider: "sanity" },
    });
  });

  it("shows reconnect options when reauthorization is required", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: true,
      apiKeyLast4: null,
    };

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(await screen.findByRole("button", { name: "Authorize with Sanity" })).toBeEnabled();
    expect(screen.getByTestId("workos-pipes-widget")).toBeInTheDocument();
  });
});
