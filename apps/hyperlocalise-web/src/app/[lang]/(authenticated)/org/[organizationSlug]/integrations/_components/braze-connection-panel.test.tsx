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

import { BrazeConnectionPanel } from "./braze-connection-panel";

const mocks = vi.hoisted(() => ({
  status: {
    connected: false,
    needsReauthorization: false,
    apiKeyLast4: null,
  } as PipesConnectionStatus,
  isLoading: false,
  isError: false,
  brazeGet: vi.fn(),
  brazePut: vi.fn(),
  brazeDelete: vi.fn(),
  getAccessToken: vi.fn(),
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
    getAccessToken: mocks.getAccessToken,
    loading: false,
  }),
}));

vi.mock("@workos-inc/widgets", () => ({
  WorkOsWidgets: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pipes: () => <div>Braze Pipes widget</div>,
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
          braze: {
            $get: (...args: unknown[]) => mocks.brazeGet(...args),
            $put: (...args: unknown[]) => mocks.brazePut(...args),
            $delete: (...args: unknown[]) => mocks.brazeDelete(...args),
          },
        },
      },
    },
  }),
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <BrazeConnectionPanel organizationSlug="acme" />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("BrazeConnectionPanel", () => {
  beforeEach(() => {
    mocks.status = {
      connected: false,
      needsReauthorization: false,
      apiKeyLast4: null,
    };
    mocks.isLoading = false;
    mocks.brazeGet.mockReset();
    mocks.brazePut.mockReset();
    mocks.brazeDelete.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.getAccessToken.mockResolvedValue("token");
    mocks.brazeGet.mockResolvedValue({
      ok: true,
      json: async () => ({ braze: null }),
    });
    mocks.brazePut.mockResolvedValue({
      ok: true,
      json: async () => ({ braze: { restEndpoint: "iad-03" } }),
    });
    mocks.brazeDelete.mockResolvedValue({ ok: true });
  });

  it("asks the user to connect a key before choosing a cluster", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText(
        "Connect a Braze API key, then choose the REST cluster for that instance.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Braze Pipes widget")).toBeInTheDocument();
    expect(screen.queryByText("REST cluster")).not.toBeInTheDocument();
  });

  it("shows the cluster picker after Pipes is connected", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(await screen.findByText("REST cluster")).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.brazeGet).toHaveBeenCalled();
    });
  });
});
