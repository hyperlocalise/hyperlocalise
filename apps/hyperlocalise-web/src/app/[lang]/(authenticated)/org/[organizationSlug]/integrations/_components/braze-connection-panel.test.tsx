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
            },
          },
          braze: {
            $get: (...args: unknown[]) => mocks.brazeGet(...args),
            $put: (...args: unknown[]) => mocks.brazePut(...args),
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
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <BrazeConnectionPanel organizationSlug="acme" disabled={disabled} />
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
    mocks.isError = false;
    mocks.brazeGet.mockReset();
    mocks.brazePut.mockReset();
    mocks.disconnectDelete.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.brazeGet.mockResolvedValue({
      ok: true,
      json: async () => ({ braze: { restEndpoint: "iad-03" } }),
    });
    mocks.brazePut.mockResolvedValue({
      ok: true,
      json: async () => ({ braze: { restEndpoint: "iad-03" } }),
    });
  });

  it("expands Connect into an inline API key and cluster form", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText(
        "Paste a Braze REST API key and choose the REST cluster for that instance.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.getByText("REST cluster")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "REST cluster" }));
    fireEvent.change(screen.getByLabelText("Search or paste a REST endpoint"), {
      target: { value: "https://rest.iad-03.braze.com/" },
    });
    expect(screen.getByRole("option", { name: "US-03 · https://rest.iad-03.braze.com" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "US-01 · https://rest.iad-01.braze.com" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "US-03 · https://rest.iad-03.braze.com" }));
    expect(screen.getByRole("button", { name: "REST cluster" })).toHaveTextContent(
      "US-03 · https://rest.iad-03.braze.com",
    );
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show API key" }));
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide API key" }));
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("Braze Pipes widget")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });

  it("saves a new API key against the stored cluster", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(await screen.findByText("Token ending in abcd")).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.brazeGet).toHaveBeenCalled();
    });
    expect(await screen.findByRole("button", { name: "REST cluster" })).toHaveTextContent(
      "US-03 · https://rest.iad-03.braze.com",
    );

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "braze-rest-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.brazePut).toHaveBeenCalledWith({
        param: { organizationSlug: "acme" },
        json: { restEndpoint: "iad-03", apiKey: "braze-rest-key" },
      });
    });
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Braze connection saved.");
    });
  });

  it("shows an empty state when the pasted cluster does not match", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(await screen.findByRole("button", { name: "REST cluster" }));
    fireEvent.change(screen.getByLabelText("Search or paste a REST endpoint"), {
      target: { value: "https://dashboard.braze.com" },
    });
    expect(screen.getByText("No REST cluster matches.")).toBeInTheDocument();
  });

  it("saves a cluster change without rotating the API key", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "REST cluster" })).toHaveTextContent(
        "US-03 · https://rest.iad-03.braze.com",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "REST cluster" }));
    fireEvent.change(screen.getByLabelText("Search or paste a REST endpoint"), {
      target: { value: "https://rest.fra-02.braze.eu" },
    });
    fireEvent.click(screen.getByRole("option", { name: "EU-02 · https://rest.fra-02.braze.eu" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.brazePut).toHaveBeenCalledWith({
        param: { organizationSlug: "acme" },
        json: { restEndpoint: "fra-02" },
      });
    });
  });

  it("surfaces a save error", async () => {
    mocks.brazePut.mockResolvedValue({ ok: false });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.change(await screen.findByLabelText("API key"), {
      target: { value: "braze-rest-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "REST cluster" }));
    fireEvent.click(screen.getByRole("option", { name: "US-01 · https://rest.iad-01.braze.com" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Failed to save the Braze connection.");
    });
  });

  it("lets an admin disconnect from Manage", async () => {
    mocks.status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };
    mocks.disconnectDelete.mockResolvedValue({ ok: true });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mocks.disconnectDelete).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", provider: "braze" },
      });
    });
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Braze disconnected.");
    });
  });

  it("keeps disconnected rows collapsed for read-only users", () => {
    renderPanel({ disabled: true });

    expect(screen.getByText("Admins can connect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });
});
