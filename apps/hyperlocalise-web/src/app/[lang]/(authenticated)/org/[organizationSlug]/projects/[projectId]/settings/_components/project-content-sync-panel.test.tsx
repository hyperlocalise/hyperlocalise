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
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    provider: "github",
    trigger: "manual",
    status: "succeeded",
    pulled: { uploaded: 3, skipped: 1, failed: 0, unmatched: 0 },
    hiddenKeys: [],
    written: 2,
    heldBack: null,
    listsHeldBack: null,
    conflicts: null,
    notSent: null,
    pushError: null,
    pullRequestUrl: "https://github.com/acme/web/pull/7",
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-11-04T00:30:00.000Z",
    completedAt: "2026-11-04T00:31:00.000Z",
  },
  {
    id: "run_1",
    provider: "github",
    trigger: "scheduled",
    status: "failed",
    pulled: null,
    hiddenKeys: [],
    written: null,
    heldBack: null,
    listsHeldBack: null,
    conflicts: null,
    notSent: null,
    pushError: null,
    pullRequestUrl: null,
    errorCode: "content_sync_connection_required",
    errorMessage: "Enable this repository in Integrations before syncing.",
    startedAt: "2026-11-03T23:00:00.000Z",
    completedAt: "2026-11-03T23:01:00.000Z",
  },
];

const gitlabSync = {
  ...savedSync,
  syncConfig: {
    provider: "gitlab",
    connectionId: "42",
    resourceKey: "acme/app",
    providerFolder: "locales",
    projectFolder: "gitlab/acme/app",
    branch: "release",
    pathTemplate: "{{locale}}.json",
  },
};

const gitlabConnected = { connected: true, available: true, connectionId: null };
const webConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Website",
  serverUrl: "https://git.acme.example",
  isDefault: true,
};
const codeConnection = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Code",
  serverUrl: "https://gitlab.com",
  isDefault: false,
};

function renderPanel(
  input: {
    canManage?: boolean;
    sync?: unknown;
    connections?: unknown[];
    gitlab?: { connected: boolean; available: boolean; connectionId?: string | null };
    gitlabConnections?: unknown[];
    runs?: unknown[];
  } = {},
) {
  api.get.mockResolvedValue(
    jsonResponse(200, {
      contentSync: {
        sync: input.sync === undefined ? savedSync : input.sync,
        runs: input.runs ?? (input.sync === null ? [] : runs),
      },
    }),
  );
  api.getConnections.mockResolvedValue(
    jsonResponse(200, {
      connections: input.connections ?? [
        { provider: "github", connectionId: "repo_1", resourceKey: "acme/web", branch: "main" },
      ],
      gitlab: input.gitlab ?? { connected: false, available: false, connectionId: null },
      gitlabConnections: input.gitlabConnections ?? [],
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
    // The branch comes from Integrations, so it is shown but not edited here.
    const branch = await screen.findByDisplayValue("main");
    expect(branch).toHaveAccessibleName("Branch");
    expect(branch).toHaveAttribute("readonly");
    expect(screen.getByText(/A GitHub sync clones the repository/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "This repository is not enabled in Integrations. Enable it there or choose another one.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Started by hand")).toBeInTheDocument();
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
      await screen.findByText(
        "Connect GitLab in Integrations to sync this project. A GitHub repository syncs from its Automation settings there.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Integrations" })).toHaveAttribute(
      "href",
      "/org/acme/integrations",
    );
  });

  it("keeps Save off until a repository and both folders are filled in", async () => {
    const user = userEvent.setup();
    renderPanel();
    const folder = await screen.findByDisplayValue("locales");

    await user.clear(folder);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Save your changes before syncing.")).toBeInTheDocument();
  });

  it("says no sync is set up to people who cannot set one up", async () => {
    renderPanel({ canManage: false, sync: null });

    expect(await screen.findByText("No sync is set up for this project.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Repository folder")).not.toBeInTheDocument();
  });

  it("blocks Sync now and Remove while a run is going", async () => {
    renderPanel({ runs: [{ ...runs[0], status: "running", pulled: null, written: null }] });

    expect(
      await screen.findByText("A sync is running. You can start another when it finishes."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync now/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove sync" })).toBeDisabled();
  });

  it("flags a saved repository that is no longer enabled", async () => {
    renderPanel({ connections: [] });

    await waitFor(() =>
      expect(
        screen.getAllByText(
          "This repository is not enabled in Integrations. Enable it there or choose another one.",
        ),
      ).toHaveLength(2),
    );
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });

  it("shows a translated message for a known save error", async () => {
    const user = userEvent.setup();
    renderPanel();
    api.put.mockResolvedValue(
      jsonResponse(409, {
        error: "content_sync_automation_overlap",
        message: "An active content sync automation already syncs this repository folder.",
      }),
    );
    const folder = await screen.findByDisplayValue("locales");

    await user.type(folder, "/web");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const { toast } = await import("sonner");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A content sync automation already syncs this repository folder into the project. Pause it on the Automations page first.",
      ),
    );
  });

  it("flags an unsafe folder before saving", async () => {
    const user = userEvent.setup();
    renderPanel();
    const folder = await screen.findByDisplayValue("locales");

    await user.clear(folder);
    await user.type(folder, "locales\\en");

    expect(
      screen.getByText("Use a folder path inside the repository, such as locales."),
    ).toBeInTheDocument();
    expect(folder).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("follows the chosen repository's default project folder until the folder is edited", async () => {
    const user = userEvent.setup();
    renderPanel({
      sync: null,
      connections: [
        { provider: "gitlab", connectionId: "42", resourceKey: "acme/app" },
        { provider: "gitlab", connectionId: "43", resourceKey: "acme/docs" },
      ],
      gitlab: gitlabConnected,
    });
    const projectFolder = await screen.findByLabelText("Project folder");

    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.click(await screen.findByRole("option", { name: "acme/app" }));
    expect(projectFolder).toHaveValue("gitlab/acme/app");

    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.click(await screen.findByRole("option", { name: "acme/docs" }));
    expect(projectFolder).toHaveValue("gitlab/acme/docs");

    await user.clear(projectFolder);
    await user.type(projectFolder, "docs");
    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.click(await screen.findByRole("option", { name: "acme/app" }));
    expect(projectFolder).toHaveValue("docs");
  });

  it("shows the stored text for a run error it has no message for", async () => {
    renderPanel({
      runs: [
        {
          ...runs[1],
          errorCode: "content_sync_provider_not_ready",
          errorMessage: "Content sync for gitlab is not available yet.",
        },
        { ...runs[1], id: "run_0", errorCode: "something_new", errorMessage: null },
      ],
    });

    expect(
      await screen.findByText("Content sync for gitlab is not available yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("The sync stopped unexpectedly.")).toBeInTheDocument();
  });

  it("explains a refused removal while a run is going", async () => {
    const user = userEvent.setup();
    renderPanel();
    api.delete.mockResolvedValue(jsonResponse(409, { error: "content_sync_in_progress" }));

    await user.click(await screen.findByRole("button", { name: "Remove sync" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    const { toast } = await import("sonner");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "A sync is running. Remove the sync once it finishes.",
      ),
    );
  });

  describe("GitLab", () => {
    it("shows a saved GitLab sync and saves its branch and language file paths", async () => {
      const user = userEvent.setup();
      renderPanel({
        sync: gitlabSync,
        runs: [],
        connections: [{ provider: "gitlab", connectionId: "42", resourceKey: "acme/app" }],
        gitlab: gitlabConnected,
      });
      const branch = await screen.findByLabelText("Branch");
      expect(branch).toHaveValue("release");
      expect(screen.getByLabelText("Language file paths")).toHaveValue("{{locale}}.json");

      await user.clear(branch);
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
      expect(api.put).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", projectId: "project_1" },
        json: {
          schedule: "hourly",
          syncConfig: {
            provider: "gitlab",
            connectionId: "42",
            resourceKey: "acme/app",
            providerFolder: "locales",
            projectFolder: "gitlab/acme/app",
            pathTemplate: "{{locale}}.json",
          },
        },
      });
    });

    it("offers the workspace's GitLab connections once there are two, lists the chosen one's projects and saves it", async () => {
      const user = userEvent.setup();
      renderPanel({
        sync: gitlabSync,
        runs: [],
        connections: [{ provider: "gitlab", connectionId: "42", resourceKey: "acme/app" }],
        gitlab: { ...gitlabConnected, connectionId: webConnection.id },
        gitlabConnections: [webConnection, codeConnection],
      });
      const picker = await screen.findByRole("combobox", { name: "GitLab connection" });
      expect(picker).toHaveTextContent("Website (git.acme.example) (default)");
      expect(api.getConnections).toHaveBeenLastCalledWith({
        param: { organizationSlug: "acme", projectId: "project_1" },
        query: {},
      });

      // Another connection lists other projects, so the repository is chosen again. While they
      // load, the pickers stay in place with the previous answer.
      let answer: (response: ReturnType<typeof jsonResponse>) => void = () => {};
      api.getConnections.mockImplementation(
        () => new Promise<ReturnType<typeof jsonResponse>>((resolve) => (answer = resolve)),
      );
      await user.click(picker);
      await user.click(await screen.findByRole("option", { name: "Code" }));
      await waitFor(() =>
        expect(api.getConnections).toHaveBeenLastCalledWith({
          param: { organizationSlug: "acme", projectId: "project_1" },
          query: { gitlabConnectionId: codeConnection.id },
        }),
      );
      expect(screen.getByRole("combobox", { name: "GitLab connection" })).toHaveTextContent("Code");
      expect(screen.getByRole("combobox", { name: "Repository" })).toBeTruthy();
      answer(
        jsonResponse(200, {
          connections: [{ provider: "gitlab", connectionId: "9", resourceKey: "code/site" }],
          gitlab: { ...gitlabConnected, connectionId: codeConnection.id },
          gitlabConnections: [webConnection, codeConnection],
        }),
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      await user.click(screen.getByRole("combobox", { name: "Repository" }));
      await user.click(await screen.findByRole("option", { name: "code/site" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
      expect(api.put.mock.calls[0]?.[0]).toMatchObject({
        json: {
          syncConfig: {
            provider: "gitlab",
            connectionId: "9",
            resourceKey: "code/site",
            gitlabConnectionId: codeConnection.id,
          },
        },
      });
    });

    it("keeps the connection picker away with one connection, and flags a sync whose connection was removed", async () => {
      renderPanel({
        sync: gitlabSync,
        runs: [],
        connections: [{ provider: "gitlab", connectionId: "42", resourceKey: "acme/app" }],
        gitlab: { ...gitlabConnected, connectionId: webConnection.id },
        gitlabConnections: [webConnection],
      });
      await screen.findByLabelText("Branch");
      expect(screen.queryByRole("combobox", { name: "GitLab connection" })).toBeNull();
      cleanup();

      renderPanel({
        sync: {
          ...gitlabSync,
          syncConfig: { ...gitlabSync.syncConfig, gitlabConnectionId: codeConnection.id },
        },
        runs: [],
        connections: [],
        gitlab: { connected: true, available: false, connectionId: codeConnection.id },
        gitlabConnections: [webConnection],
      });
      const picker = await screen.findByRole("combobox", { name: "GitLab connection" });
      expect(picker).toHaveTextContent("Removed connection");
      expect(screen.getByText(/removed in Integrations. Choose another connection/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
      cleanup();

      // With no connection left, the way out is Integrations, not the picker.
      renderPanel({
        sync: {
          ...gitlabSync,
          syncConfig: { ...gitlabSync.syncConfig, gitlabConnectionId: codeConnection.id },
        },
        runs: [],
        connections: [],
        gitlab: { connected: false, available: false, connectionId: codeConnection.id },
        gitlabConnections: [],
      });
      await screen.findByRole("combobox", { name: "GitLab connection" });
      expect(screen.getByText(/Add a connection there, then choose it here/)).toBeTruthy();
    });

    it("labels a GitLab run's review link as a merge request", async () => {
      renderPanel({
        sync: gitlabSync,
        runs: [
          {
            ...runs[0],
            provider: "gitlab",
            pullRequestUrl: "https://gitlab.example/acme/app/-/merge_requests/3",
          },
        ],
        connections: [
          { provider: "gitlab", connectionId: "42", resourceKey: "acme/app", branch: null },
        ],
        gitlab: gitlabConnected,
      });

      expect(await screen.findByRole("link", { name: "Open merge request" })).toHaveAttribute(
        "href",
        "https://gitlab.example/acme/app/-/merge_requests/3",
      );
      expect(screen.getByText(/A GitLab sync reads the repository/)).toBeInTheDocument();
    });

    it("sets up a GitLab sync once the language file paths name the language", async () => {
      const user = userEvent.setup();
      renderPanel({
        sync: null,
        connections: [
          { provider: "github", connectionId: "repo_1", resourceKey: "acme/web" },
          { provider: "gitlab", connectionId: "42", resourceKey: "acme/app" },
        ],
        gitlab: gitlabConnected,
      });

      // A new sync starts on GitLab and lists only its repositories.
      await user.click(await screen.findByRole("combobox", { name: "Repository" }));
      expect(screen.queryByRole("option", { name: "acme/web" })).not.toBeInTheDocument();
      await user.click(await screen.findByRole("option", { name: "acme/app" }));
      expect(screen.getByLabelText("Project folder")).toHaveValue("gitlab/acme/app");
      await user.type(screen.getByLabelText("Repository folder"), "locales");

      const paths = screen.getByLabelText("Language file paths");
      await user.type(paths, "messages.json");
      expect(paths).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      await user.clear(paths);
      // userEvent reads { as a key descriptor, so it is typed doubled.
      await user.type(paths, "{{{{locale}}.json");
      expect(paths).toHaveValue("{{locale}}.json");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
      expect(api.put.mock.calls[0]![0].json.syncConfig).toEqual({
        provider: "gitlab",
        connectionId: "42",
        resourceKey: "acme/app",
        providerFolder: "locales",
        projectFolder: "gitlab/acme/app",
        pathTemplate: "{{locale}}.json",
      });
    });

    it("can't choose GitHub for a new sync, which is set up in Integrations", async () => {
      const user = userEvent.setup();
      renderPanel({
        sync: null,
        connections: [
          { provider: "github", connectionId: "repo_1", resourceKey: "acme/web" },
          { provider: "gitlab", connectionId: "42", resourceKey: "acme/app" },
        ],
        gitlab: gitlabConnected,
      });

      await user.click(await screen.findByRole("combobox", { name: "Repository service" }));
      expect(await screen.findByRole("option", { name: "GitHub Not available" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("option", { name: "GitLab" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(
        screen.getByText("Sync a GitHub repository from its Automation settings in Integrations."),
      ).toBeInTheDocument();
    });

    it("keeps a saved GitHub sync's service and can't switch it to an unconnected GitLab", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(await screen.findByRole("combobox", { name: "Repository service" }));
      expect(await screen.findByRole("option", { name: "GitHub" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("option", { name: "GitLab Not set up" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(
        screen.getByText("Connect GitLab in Integrations to sync from GitLab."),
      ).toBeInTheDocument();
    });

    it("keeps a saved GitLab sync's service after GitLab is disconnected", async () => {
      const user = userEvent.setup();
      renderPanel({ sync: gitlabSync, connections: [] });

      await user.click(await screen.findByRole("combobox", { name: "Repository service" }));
      expect(await screen.findByRole("option", { name: "GitLab" })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("option", { name: "GitHub Not available" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(
        screen.getByText("Connect GitLab in Integrations to sync from GitLab."),
      ).toBeInTheDocument();
    });

    it("does not call a saved GitLab repository missing while the server can't be read", async () => {
      renderPanel({
        sync: gitlabSync,
        connections: [],
        gitlab: { connected: true, available: false },
      });

      expect(
        await screen.findByText(
          "Unable to list the GitLab repositories. Check the connection in Integrations.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          "The workspace's GitLab token can't see this repository. Choose it again.",
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
    });

    it("shows files left out and keys a run hid, and a GitLab run's own error text", async () => {
      const user = userEvent.setup();
      renderPanel({
        sync: gitlabSync,
        connections: [
          { provider: "gitlab", connectionId: "42", resourceKey: "acme/app", branch: null },
        ],
        gitlab: gitlabConnected,
        runs: [
          {
            ...runs[0],
            provider: "gitlab",
            pullRequestUrl: null,
            written: 0,
            heldBack: 2,
            listsHeldBack: 1,
            conflicts: 1,
            notSent: 1,
            pushError: {
              code: "content_sync_connection_required",
              message: "The token can't write.",
            },
            pulled: { uploaded: 1, skipped: 0, failed: 0, unmatched: 2 },
            hiddenKeys: [
              { path: "gitlab/acme/app/en.json", keys: ["home.title", "home.body"], keyCount: 22 },
            ],
          },
          {
            ...runs[1],
            provider: "gitlab",
            errorMessage:
              "The workspace's GitLab token was refused. Check the connection in Integrations.",
          },
        ],
      });

      expect(
        await screen.findByText("2 files in the folder didn't match the language file paths"),
      ).toBeInTheDocument();
      await user.click(
        screen.getByText("22 keys were hidden because the repository no longer has them"),
      );
      expect(screen.getByText("home.title, home.body")).toBeInTheDocument();
      expect(screen.getByText(/and 20 more/)).toBeInTheDocument();
      // A refused write explains itself instead of "no new translations".
      expect(screen.queryByText("No new translations to send")).not.toBeInTheDocument();
      expect(screen.getByText(/2 language files wait until every translation/)).toBeInTheDocument();
      expect(screen.getByText(/1 list was left as the repository has it/)).toBeInTheDocument();
      expect(
        screen.getByText(/1 language file wasn't sent because two source files/),
      ).toBeInTheDocument();
      expect(screen.getByText(/1 file wasn't sent back/)).toBeInTheDocument();
      expect(
        screen.getByText("Translations weren't sent: The token can't write."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "The workspace's GitLab token was refused. Check the connection in Integrations.",
        ),
      ).toBeInTheDocument();
    });
  });
});
