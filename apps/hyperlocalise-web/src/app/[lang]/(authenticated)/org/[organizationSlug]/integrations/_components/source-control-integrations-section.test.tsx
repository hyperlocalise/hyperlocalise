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
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  connectionGet: vi.fn(),
  ownSignIn: vi.fn<() => { connected: boolean; needsReauthorization?: boolean } | undefined>(),
}));

vi.mock("@/lib/api-client", () => ({
  createApiClient: () => ({
    api: {
      orgs: {
        ":organizationSlug": {
          gitlab: { connection: { $get: mocks.connectionGet } },
        },
      },
    },
  }),
}));

// The rows themselves have their own tests; here only which rows appear matters.
vi.mock("./github-integration-row", () => ({
  GitHubIntegrationRow: () => <div>GitHub row</div>,
}));
vi.mock("./gitlab-server-connection-panel", () => ({
  GitLabServerConnectionPanel: () => <div>GitLab row</div>,
}));
vi.mock("./pipes-connection-panel", () => ({
  PipesConnectionPanel: ({ name, description }: { name?: string; description?: string }) => (
    <div>
      {name}: {description}
    </div>
  ),
  usePipesStatus: (_slug: string, _provider: string, _refetch: boolean, enabled: boolean) => ({
    data: enabled ? mocks.ownSignIn() : undefined,
  }),
}));

import { SourceControlIntegrationsSection } from "./agent-integrations-section";

const connected = {
  gitlabConnection: {
    serverUrl: "https://gitlab.com",
    connectedUsername: "translations-bot",
    maskedTokenSuffix: "••••abcd",
    updatedAt: "2026-11-05T00:00:00.000Z",
  },
};

function renderSection(input: { userIsAdmin?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <IntlProvider locale="en">
        <SourceControlIntegrationsSection
          organizationSlug="acme"
          userCanManage
          userIsAdmin={input.userIsAdmin ?? true}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
  return client;
}

function connectionStatus(client: QueryClient) {
  return client.getQueryState(["gitlab", "acme", "connection"])?.status;
}

describe("SourceControlIntegrationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ownSignIn.mockReturnValue({ connected: false });
  });

  it("offers an admin their own GitLab.com sign-in while the workspace has no GitLab connection", async () => {
    mocks.connectionGet.mockResolvedValue(Response.json({ gitlabConnection: null }));
    renderSection();

    expect(
      await screen.findByText(/GitLab.com sign-in: Your own GitLab.com account, for chat/),
    ).toBeTruthy();
    expect(screen.getByText("GitLab row")).toBeTruthy();
    expect(screen.getByText("GitHub row")).toBeTruthy();
  });

  it("drops the sign-in row once the workspace has connected GitLab", async () => {
    mocks.connectionGet.mockResolvedValue(Response.json(connected));
    const client = renderSection();

    await waitFor(() => expect(connectionStatus(client)).toBe("success"));
    expect(screen.queryByText(/GitLab.com sign-in/)).toBeNull();
  });

  it("keeps the row, marked as not in use, for someone whose own sign-in is still stored", async () => {
    mocks.connectionGet.mockResolvedValue(Response.json(connected));
    mocks.ownSignIn.mockReturnValue({ connected: true });
    renderSection();

    expect(
      await screen.findByText(/GitLab.com sign-in: Not used while GitLab is connected/),
    ).toBeTruthy();
  });

  it("keeps the row for a sign-in that has expired, which is still stored", async () => {
    mocks.connectionGet.mockResolvedValue(Response.json(connected));
    mocks.ownSignIn.mockReturnValue({ connected: false, needsReauthorization: true });
    renderSection();

    expect(
      await screen.findByText(/GitLab.com sign-in: Not used while GitLab is connected/),
    ).toBeTruthy();
  });

  it("shows no sign-in row to people who can't sign in, whatever the connection route answers", async () => {
    // Roles without integrations:read get 403, which the hook reads as "no connection".
    mocks.connectionGet.mockResolvedValue(new Response("{}", { status: 403 }));
    const client = renderSection({ userIsAdmin: false });

    await waitFor(() => expect(connectionStatus(client)).toBe("success"));
    expect(screen.queryByText(/GitLab.com sign-in/)).toBeNull();
  });

  it("leaves the sign-in row out while the connection is unknown", async () => {
    mocks.connectionGet.mockResolvedValue(new Response("{}", { status: 500 }));
    const client = renderSection();

    await waitFor(() => expect(connectionStatus(client)).toBe("error"));
    expect(screen.getByText("GitLab row")).toBeTruthy();
    expect(screen.queryByText(/GitLab.com sign-in/)).toBeNull();
  });
});
