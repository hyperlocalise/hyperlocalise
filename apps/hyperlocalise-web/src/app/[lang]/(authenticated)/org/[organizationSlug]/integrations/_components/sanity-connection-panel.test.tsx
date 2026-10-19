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
import userEvent from "@testing-library/user-event";
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
  availability: {
    workosConfigured: true,
    providerConfigured: true,
    providerEnabled: true,
    supportedAuthMethods: ["oauth", "api_key"] as const,
  },
  isLoading: false,
  isError: false,
  authorizeGet: vi.fn(),
  disconnectDelete: vi.fn(),
  sanityPut: vi.fn(),
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

vi.mock("./pipes-connection-panel", () => ({
  usePipesProviderAvailability: () => ({
    data: mocks.availability,
    isLoading: false,
    isSuccess: true,
    isError: false,
  }),
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
            $put: (...args: unknown[]) => mocks.sanityPut(...args),
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
    mocks.availability = {
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: true,
      supportedAuthMethods: ["oauth", "api_key"],
    };
    mocks.isLoading = false;
    mocks.isError = false;
    mocks.authorizeGet.mockReset();
    mocks.disconnectDelete.mockReset();
    mocks.sanityPut.mockReset();
    mocks.projectsGet.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    window.location.href = "http://localhost/";
  });

  it("shows authentication method and OAuth connect when expanded", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByLabelText("Authentication method")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Authorize Hyperlocalise to access Sanity on your behalf through WorkOS Pipes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authorize with Sanity" })).toBeEnabled();
    expect(screen.queryByTestId("workos-pipes-widget")).not.toBeInTheDocument();
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
  });

  it("shows Coming soon when Sanity is not enabled in WorkOS Pipes", async () => {
    mocks.availability = {
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: false,
      supportedAuthMethods: ["api_key"],
    };

    renderPanel();
    expect(await screen.findByRole("button", { name: "Coming soon" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("hides OAuth authorize when WorkOS only supports API key", async () => {
    mocks.availability = {
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: true,
      supportedAuthMethods: ["api_key"],
    };

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByTestId("sanity-api-token-input")).toBeInTheDocument();
    expect(screen.queryByLabelText("Authentication method")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize with Sanity" })).not.toBeInTheDocument();
  });

  it("enables Save token after paste when WorkOS Pipes is disabled but a connection exists", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: true,
      apiKeyLast4: null,
    };
    mocks.availability = {
      workosConfigured: true,
      providerConfigured: true,
      providerEnabled: false,
      supportedAuthMethods: ["api_key"],
    };
    const user = userEvent.setup();

    renderPanel();
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const apiTokenInput = await screen.findByTestId("sanity-api-token-input");
    await user.type(apiTokenInput, "sk-sanity-test-token");

    expect(screen.getByRole("button", { name: "Save token" })).toBeEnabled();
  });

  it("saves an API token when API token method is selected", async () => {
    mocks.sanityPut.mockResolvedValue({ ok: true, json: async () => ({ sanity: {} }) });
    const user = userEvent.setup();

    renderPanel();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await user.click(await screen.findByRole("combobox", { name: "Authentication method" }));
    await user.click(await screen.findByRole("option", { name: "API token" }));

    const apiTokenInput = await screen.findByTestId("sanity-api-token-input");
    await user.type(apiTokenInput, "sk-sanity-test-token");
    await user.click(screen.getByRole("button", { name: "Save token" }));

    await waitFor(() => {
      expect(mocks.sanityPut).toHaveBeenCalledWith({
        param: { organizationSlug: "acme" },
        json: { apiToken: "sk-sanity-test-token" },
      });
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Sanity API token saved.");
  });
});
