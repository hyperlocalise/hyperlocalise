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
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { AccessTokenSummary } from "./access-token-lifecycle";

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "api-keys": {
            $get: (...args: unknown[]) => getMock(...args),
            $post: vi.fn(),
            ":apiKeyId": {
              $delete: vi.fn(),
            },
          },
        },
      },
    },
  },
}));

import { ApiKeySettingsPageContent } from "./api-keys-page-content";

function createKey(overrides: Partial<AccessTokenSummary> = {}): AccessTokenSummary {
  return {
    id: "key_1",
    name: "Production CI",
    keyPrefix: "hl_AbCd",
    permissions: ["jobs:read", "jobs:write", "files:read", "files:write"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-08-01T15:30:00.000Z",
    createdByUserId: "user_1",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          {children}
        </IntlProvider>
      </QueryClientProvider>
    );
  }

  return render(<ApiKeySettingsPageContent organizationSlug="acme" />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ApiKeySettingsPageContent", () => {
  it("shows creation time and a never-used state for organization API keys", async () => {
    getMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKeys: [
          createKey(),
          createKey({
            id: "key_2",
            name: "Used key",
            lastUsedAt: "2026-08-02T09:00:00.000Z",
          }),
        ],
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Production CI")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Created Aug 1, 2026/)).toHaveLength(2);
    expect(screen.getByText(/Last used Never/)).toBeInTheDocument();
    expect(screen.getByText(/Last used Aug 2, 2026/)).toBeInTheDocument();
  });

  it("keeps revoked organization API keys out of the compatibility list", async () => {
    getMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKeys: [
          createKey({
            id: "key_revoked",
            name: "Retired key",
            revokedAt: "2026-08-03T12:00:00.000Z",
          }),
        ],
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No API keys yet")).toBeInTheDocument();
    });
    expect(screen.queryByText("Retired key")).not.toBeInTheDocument();
  });
});
