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
  GitLabServerConnectionPanel: ({ isLast }: { isLast?: boolean }) => (
    <div>GitLab row{isLast ? " (last)" : ""}</div>
  ),
}));
vi.mock("./pipes-connection-panel", () => ({
  PipesConnectionPanel: ({ provider, description }: { provider: string; description?: string }) => (
    <div>
      {provider} sign-in row: {description}
    </div>
  ),
}));

import { SourceControlIntegrationsSection } from "./agent-integrations-section";

function renderSection() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IntlProvider locale="en">
        <SourceControlIntegrationsSection organizationSlug="acme" userCanManage userIsAdmin />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("SourceControlIntegrationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the member GitLab.com sign-in, for chat, while the workspace has no GitLab connection", async () => {
    mocks.connectionGet.mockResolvedValue(Response.json({ gitlabConnection: null }));
    renderSection();

    expect(
      await screen.findByText(/gitlab sign-in row: Sign in with your own GitLab.com account/),
    ).toBeTruthy();
    expect(screen.getByText("GitLab row")).toBeTruthy();
    expect(screen.getByText("GitHub row")).toBeTruthy();
  });

  it("drops the sign-in row once the workspace has connected GitLab", async () => {
    mocks.connectionGet.mockResolvedValue(
      Response.json({
        gitlabConnection: {
          serverUrl: "https://gitlab.com",
          connectedUsername: "translations-bot",
          maskedTokenSuffix: "••••abcd",
          updatedAt: "2026-11-05T00:00:00.000Z",
        },
      }),
    );
    renderSection();

    expect(await screen.findByText("GitLab row (last)")).toBeTruthy();
    expect(screen.queryByText(/sign-in row/)).toBeNull();
  });

  it("leaves the sign-in row out while the connection is unknown", async () => {
    mocks.connectionGet.mockResolvedValue(new Response("{}", { status: 500 }));
    renderSection();

    await waitFor(() => expect(mocks.connectionGet).toHaveBeenCalled());
    expect(screen.getByText(/GitLab row/)).toBeTruthy();
    expect(screen.queryByText(/sign-in row/)).toBeNull();
  });
});
