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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ProjectContentSyncPanel } from "./project-content-sync-panel";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  getConnections: vi.fn(),
  put: vi.fn(),
  postRun: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/app-shell/org-nav-link", () => ({
  OrgNavLink: (props: { href: string }) => <a {...props} />,
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              "content-sync": {
                $get: api.get,
                $put: api.put,
                $delete: api.delete,
                connections: { $get: api.getConnections },
                runs: { $post: api.postRun },
              },
            },
          },
        },
      },
    },
  },
}));

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 300, status, json: async () => body };
}

const savedSync = {
  id: "sync_1",
  schedule: "hourly",
  nextRunAt: "2026-11-04T01:00:00.000Z",
  updatedAt: "2026-11-04T00:00:00.000Z",
  syncConfig: {
    provider: "github",
    connectionId: "repo_1",
    resourceKey: "acme/web",
    providerFolder: "locales",
    projectFolder: "github/acme/web",
  },
};

const runs = [
  {
    id: "run_2",
    trigger: "manual",
    status: "succeeded",
    pulled: { uploaded: 3, skipped: 1, failed: 0 },
    written: 2,
    pullRequestUrl: "https://github.com/acme/web/pull/7",
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-11-04T00:30:00.000Z",
    completedAt: "2026-11-04T00:31:00.000Z",
  },
  {
    id: "run_1",
    trigger: "scheduled",
    status: "failed",
    pulled: null,
    written: null,
    pullRequestUrl: null,
    errorCode: "content_sync_connection_required",
    errorMessage: "Enable this repository in Integrations before syncing.",
    startedAt: "2026-11-03T23:00:00.000Z",
    completedAt: "2026-11-03T23:01:00.000Z",
  },
];

function renderPanel(input: { canManage?: boolean; sync?: unknown; connections?: unknown[] } = {}) {
  api.get.mockResolvedValue(
    jsonResponse(200, {
      contentSync: {
        sync: input.sync === undefined ? savedSync : input.sync,
        runs: input.sync === null ? [] : runs,
      },
    }),
  );
  api.getConnections.mockResolvedValue(
    jsonResponse(200, {
      connections: input.connections ?? [
        { provider: "github", connectionId: "repo_1", resourceKey: "acme/web" },
      ],
    }),
  );
  api.put.mockResolvedValue(jsonResponse(200, { sync: savedSync }));
  api.postRun.mockResolvedValue(jsonResponse(202, { run: runs[0] }));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IntlProvider locale="en" messages={{}}>
        <ProjectContentSyncPanel
          organizationSlug="acme"
          projectId="project_1"
          canManage={input.canManage ?? true}
        />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProjectContentSyncPanel", () => {
  it("shows the saved settings and recent runs with their result", async () => {
    renderPanel();

    expect(await screen.findByDisplayValue("locales")).toBeInTheDocument();
    expect(screen.getByDisplayValue("github/acme/web")).toBeInTheDocument();
    expect(screen.getByText(/3 files imported, 1 unchanged/)).toBeInTheDocument();
    expect(screen.getByText(/2 translated files sent/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open pull request" })).toHaveAttribute(
      "href",
      "https://github.com/acme/web/pull/7",
    );
    expect(
      screen.getByText("Enable this repository in Integrations before syncing."),
    ).toBeInTheDocument();
  });

  it("saves edited settings and blocks Sync now until they are saved", async () => {
    const user = userEvent.setup();
    renderPanel();
    const folder = await screen.findByDisplayValue("locales");

    await user.clear(folder);
    await user.type(folder, "i18n");
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_1" },
      json: {
        schedule: "hourly",
        syncConfig: expect.objectContaining({
          provider: "github",
          connectionId: "repo_1",
          providerFolder: "i18n",
          projectFolder: "github/acme/web",
        }),
      },
    });
  });

  it("starts a run with Sync now", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Sync now" }));

    await waitFor(() => expect(api.postRun).toHaveBeenCalledTimes(1));
  });

  it("is read-only for people who cannot change project settings", async () => {
    renderPanel({ canManage: false });

    expect(await screen.findByDisplayValue("locales")).toBeDisabled();
    expect(screen.getByText("You can see these settings but not change them.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(api.getConnections).not.toHaveBeenCalled();
  });

  it("points to Integrations when there is no repository to choose", async () => {
    renderPanel({ sync: null, connections: [] });

    expect(
      await screen.findByText("Connect a GitHub repository in Integrations to sync this project."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Integrations" })).toHaveAttribute(
      "href",
      "/org/acme/integrations",
    );
  });
});
