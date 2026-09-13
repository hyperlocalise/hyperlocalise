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
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PipesConnectionStatus } from "@/lib/pipes/types";

import { DomainSearchConsoleConnect } from "./domain-search-console-connect";

const mocks = vi.hoisted(() => ({
  status: {
    connected: false,
    needsReauthorization: false,
    apiKeyLast4: null,
  } as PipesConnectionStatus,
  isLoading: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/domains/hyperlocalise-com/search-console",
}));

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAccessToken: () => ({
    getAccessToken: async () => "test-access-token",
    loading: false,
  }),
}));

vi.mock("@workos-inc/widgets", () => ({
  WorkOsWidgets: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pipes: () => <button type="button">Connect Google Search Console</button>,
}));

vi.mock("../../integrations/_components/pipes-connection-panel", () => ({
  usePipesStatus: () => ({
    data: mocks.status,
    isLoading: mocks.isLoading,
  }),
}));

function renderConnect(canManageConnection = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <DomainSearchConsoleConnect
          organizationSlug="acme"
          linkedDomainId="hyperlocalise-com"
          canManageConnection={canManageConnection}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("DomainSearchConsoleConnect", () => {
  beforeEach(() => {
    mocks.status = {
      connected: false,
      needsReauthorization: false,
      apiKeyLast4: null,
    };
    mocks.isLoading = false;
  });

  it("renders the Search Console Pipes widget for admins", () => {
    renderConnect();
    expect(
      screen.getByRole("button", { name: "Connect Google Search Console" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage in Integrations" })).toHaveAttribute(
      "href",
      "/org/acme/integrations",
    );
  });

  it("hides the widget when the user cannot manage integrations", () => {
    renderConnect(false);
    expect(screen.getByText("Admins can connect")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Google Search Console" }),
    ).not.toBeInTheDocument();
  });

  it("shows a reconnect hint when the pipe needs reauthorization", () => {
    mocks.status = {
      connected: false,
      needsReauthorization: true,
      apiKeyLast4: null,
    };
    renderConnect();
    expect(
      screen.getByText("Reconnect Google Search Console to keep this integration working."),
    ).toBeInTheDocument();
  });
});
