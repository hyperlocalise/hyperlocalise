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
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  connectionsGet: vi.fn(),
  connectionsPost: vi.fn(),
  connectionPut: vi.fn(),
  connectionDelete: vi.fn(),
  checkGet: vi.fn(),
  defaultPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock("@/lib/api-client", () => ({
  createApiClient: () => ({
    api: {
      orgs: {
        ":organizationSlug": {
          gitlab: {
            connections: {
              $get: mocks.connectionsGet,
              $post: mocks.connectionsPost,
              ":connectionId": {
                $put: mocks.connectionPut,
                $delete: mocks.connectionDelete,
                check: { $get: mocks.checkGet },
                default: { $post: mocks.defaultPost },
              },
            },
          },
        },
      },
    },
  }),
}));

import { GitLabServerConnectionPanel } from "./gitlab-server-connection-panel";

const webConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Website",
  storedName: "Website",
  isDefault: true,
  serverUrl: "https://git.acme.example",
  connectedUsername: "translations-bot",
  maskedTokenSuffix: "••••abcd",
  updatedAt: "2026-11-03T00:00:00.000Z",
  syncCount: 0,
};
const codeConnection = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Code",
  storedName: "Code",
  isDefault: false,
  serverUrl: "https://gitlab.com",
  connectedUsername: "code-bot",
  maskedTokenSuffix: "••••ef01",
  updatedAt: "2026-11-04T00:00:00.000Z",
  syncCount: 2,
};

type Connection = Omit<typeof webConnection, "storedName"> & { storedName: string | null };

function listing(connections: Connection[]) {
  mocks.connectionsGet.mockImplementation(async () =>
    Response.json({ gitlabConnections: connections }),
  );
}

function renderPanel(props: { disabled?: boolean } = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IntlProvider locale="en">
        <GitLabServerConnectionPanel organizationSlug="acme" {...props} />
      </IntlProvider>
    </QueryClientProvider>,
  );
}

async function openRow() {
  fireEvent.click(await screen.findByRole("button", { name: /^(Connect|Manage|View)/ }));
}

async function openAddForm() {
  fireEvent.click(await screen.findByRole("button", { name: "Add connection" }));
}

describe("GitLabServerConnectionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listing([]);
    mocks.checkGet.mockImplementation(async () =>
      Response.json({ working: true, abilities: null, readsProjects: true }),
    );
    mocks.connectionsPost.mockResolvedValue(
      Response.json({ gitlabConnection: webConnection }, { status: 201 }),
    );
    mocks.connectionPut.mockResolvedValue(Response.json({ gitlabConnection: webConnection }));
    mocks.connectionDelete.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.defaultPost.mockResolvedValue(Response.json({ gitlabConnection: codeConnection }));
  });

  it("adds a first connection to GitLab.com with just a token, or to a company server with its address", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openRow();
    await openAddForm();

    const save = await screen.findByRole("button", { name: "Check and save" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Website" } });
    // Nothing is assumed: a token typed before the choice is sent nowhere.
    const token = screen.getByLabelText("Access token");
    fireEvent.change(token, { target: { value: "glpat-secret" } });
    expect(save).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText("Server address")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Connect to" }));
    await user.click(await screen.findByRole("option", { name: "GitLab.com" }));
    expect(save).toHaveProperty("disabled", false);
    expect(screen.getByText(/project or group access token/)).toBeTruthy();

    // A company server needs its address before anything is sent anywhere.
    await user.click(screen.getByRole("combobox", { name: "Connect to" }));
    await user.click(await screen.findByRole("option", { name: "Your company's GitLab server" }));
    expect(save).toHaveProperty("disabled", true);
    expect(screen.getByText(/token from a non-admin user/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Server address"), {
      target: { value: "https://git.acme.example" },
    });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("GitLab connection saved."),
    );
    expect(mocks.connectionsPost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      json: { name: "Website", serverUrl: "https://git.acme.example", accessToken: "glpat-secret" },
    });
    expect(mocks.connectionPut).not.toHaveBeenCalled();
    // The form closes; the token never lingers.
    expect(screen.queryByLabelText("Access token")).toBeNull();
  });

  it("saves GitLab.com without an address field", async () => {
    const user = userEvent.setup();
    renderPanel();
    await openRow();
    await openAddForm();

    await user.click(await screen.findByRole("combobox", { name: "Connect to" }));
    await user.click(await screen.findByRole("option", { name: "GitLab.com" }));
    fireEvent.change(screen.getByLabelText("Access token"), {
      target: { value: "glpat-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.connectionsPost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      json: { name: "", serverUrl: "https://gitlab.com", accessToken: "glpat-secret" },
    });
  });

  it("shows the server's reason when saving fails, and keeps what was typed", async () => {
    const user = userEvent.setup();
    mocks.connectionsPost.mockResolvedValue(
      Response.json(
        { error: "gitlab_token_rejected", message: "The server refused this token." },
        { status: 400 },
      ),
    );
    renderPanel();
    await openRow();
    await openAddForm();
    await user.click(await screen.findByRole("combobox", { name: "Connect to" }));
    await user.click(await screen.findByRole("option", { name: "GitLab.com" }));
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("The server refused this token."),
    );
    expect(screen.getByLabelText("Access token")).toHaveProperty("value", "glpat-bad");
  });

  it("lists the connections with the default marked, checks each one live, and describes them on the row", async () => {
    listing([webConnection, codeConnection]);
    renderPanel();

    expect(
      await screen.findByText("2 connections. Chat and automations use Website."),
    ).toBeTruthy();
    expect(mocks.checkGet).not.toHaveBeenCalled();

    await openRow();

    const website = await screen.findByRole("listitem", { name: "Website" });
    expect(within(website).getByText("Default")).toBeTruthy();
    expect(await within(website).findByText(/The connection is working/)).toBeTruthy();
    const code = screen.getByRole("listitem", { name: "Code" });
    expect(within(code).queryByText("Default")).toBeNull();
    expect(within(code).getByText(/Used by 2 project syncs/)).toBeTruthy();
    expect(within(code).getByText(/Connected to https:\/\/gitlab.com as code-bot/)).toBeTruthy();
    await waitFor(() => expect(mocks.checkGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText("Access token")).toBeNull();
  });

  it("says what the token can do: send or pull only, when it expires, and when it reads nothing", async () => {
    listing([webConnection, codeConnection]);
    mocks.checkGet.mockImplementation(async (input: { param: { connectionId: string } }) =>
      Response.json(
        input.param.connectionId === webConnection.id
          ? {
              working: true,
              abilities: { scopes: ["api"], canSend: true, expiresAt: "2027-11-05" },
              readsProjects: true,
            }
          : {
              working: true,
              abilities: { scopes: ["read_api"], canSend: false, expiresAt: null },
              readsProjects: false,
            },
      ),
    );
    renderPanel();
    await openRow();

    const website = await screen.findByRole("listitem", { name: "Website" });
    expect(await within(website).findByText(/It can pull and send merge requests/)).toBeTruthy();
    expect(within(website).getByText(/Expires on Nov 5, 2027/)).toBeTruthy();
    const code = screen.getByRole("listitem", { name: "Code" });
    expect(await within(code).findByText(/read-only \(no api scope\)/)).toBeTruthy();
    expect(within(code).getByText(/It can read no projects/)).toBeTruthy();
  });

  it("describes one connection the old way", async () => {
    listing([webConnection]);
    renderPanel();

    expect(
      await screen.findByText("Connected to https://git.acme.example as translations-bot."),
    ).toBeTruthy();
  });

  it("marks another connection as the one chat and automations use", async () => {
    listing([webConnection, codeConnection]);
    renderPanel();
    await openRow();

    const code = await screen.findByRole("listitem", { name: "Code" });
    fireEvent.click(within(code).getByRole("button", { name: "Use for chat and automations" }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Chat and automations now use Code."),
    );
    expect(mocks.defaultPost).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", connectionId: codeConnection.id },
    });
    const website = screen.getByRole("listitem", { name: "Website" });
    expect(
      within(website).queryByRole("button", { name: "Use for chat and automations" }),
    ).toBeNull();
  });

  it("changes a connection with its name and address filled in, and asks for the token again", async () => {
    listing([webConnection]);
    renderPanel();
    await openRow();

    const website = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(website).getByRole("button", { name: "Change" }));

    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Website");
    expect(screen.getByLabelText("Server address")).toHaveProperty(
      "value",
      "https://git.acme.example",
    );
    expect(screen.getByText(/Enter the token again/)).toBeTruthy();
    const save = screen.getByRole("button", { name: "Check and save" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Web" } });
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-new" } });
    fireEvent.click(save);

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.connectionPut).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", connectionId: webConnection.id },
      json: { name: "Web", serverUrl: "https://git.acme.example", accessToken: "glpat-new" },
    });
    expect(mocks.connectionsPost).not.toHaveBeenCalled();
  });

  it("starts the Change form of a connection saved before names with an empty name, its host as the hint", async () => {
    const unnamed = {
      ...webConnection,
      name: "git.acme.example",
      storedName: null,
      syncCount: 1,
    };
    listing([unnamed]);
    mocks.connectionPut.mockResolvedValue(Response.json({ gitlabConnection: unnamed }));
    renderPanel();
    await openRow();
    const item = await screen.findByRole("listitem", { name: "git.acme.example" });
    expect(within(item).getByText(/Used by 1 project sync/)).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Change" }));

    const nameField = screen.getByLabelText("Name");
    expect(nameField).toHaveProperty("value", "");
    expect(nameField).toHaveProperty("placeholder", "git.acme.example");
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-new" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    // The host is never stored as a name.
    expect(mocks.connectionPut).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", connectionId: unnamed.id },
      json: { name: "", serverUrl: "https://git.acme.example", accessToken: "glpat-new" },
    });
  });

  it("says what chat and automations will use once the default is removed, and when nothing is left", async () => {
    listing([webConnection, codeConnection]);
    renderPanel();
    await openRow();

    const website = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(website).getByRole("button", { name: "Remove" }));
    expect(within(website).getByText(/Chat and automations will use Code instead/)).toBeTruthy();
    fireEvent.click(within(website).getByRole("button", { name: "Cancel" }));
    const code = screen.getByRole("listitem", { name: "Code" });
    fireEvent.click(within(code).getByRole("button", { name: "Remove" }));
    expect(within(code).queryByText(/Chat and automations will use/)).toBeNull();
    cleanup();

    listing([webConnection]);
    renderPanel();
    await openRow();
    const only = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(only).getByRole("button", { name: "Remove" }));
    expect(within(only).getByText(/go back to members' own GitLab.com sign-ins/)).toBeTruthy();
  });

  it("keeps a Change form open for another connection when one is removed", async () => {
    listing([webConnection, codeConnection]);
    renderPanel();
    await openRow();

    const website = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(website).getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-typed" } });
    const code = screen.getByRole("listitem", { name: "Code" });
    fireEvent.click(within(code).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(code).getByRole("button", { name: "Remove connection" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(screen.getByLabelText("Access token")).toHaveProperty("value", "glpat-typed");
  });

  it("doesn't check again right after a save, only when the row is opened again", async () => {
    listing([webConnection]);
    renderPanel();
    await openRow();
    await screen.findByText(/The connection is working/);
    expect(mocks.checkGet).toHaveBeenCalledTimes(1);

    const resaved = { ...webConnection, updatedAt: "2026-11-03T00:05:00.000Z" };
    mocks.connectionPut.mockImplementation(async () =>
      Response.json({ gitlabConnection: resaved }),
    );
    listing([resaved]);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-new" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    await screen.findByText(/The connection is working/);
    expect(mocks.checkGet).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^(Manage|Connect|View)/ }));
    await openRow();
    await waitFor(() => expect(mocks.checkGet).toHaveBeenCalledTimes(2));
  });

  it("asks before removing a connection, says how many syncs use it, and can be cancelled", async () => {
    listing([webConnection, codeConnection]);
    renderPanel();
    await openRow();

    const code = await screen.findByRole("listitem", { name: "Code" });
    fireEvent.click(within(code).getByRole("button", { name: "Remove" }));
    expect(
      within(code).getByText(/2 project syncs use it and will stop until they are given another/),
    ).toBeTruthy();
    expect(mocks.connectionDelete).not.toHaveBeenCalled();

    fireEvent.click(within(code).getByRole("button", { name: "Cancel" }));
    expect(within(code).queryByRole("button", { name: "Remove connection" })).toBeNull();

    fireEvent.click(within(code).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(code).getByRole("button", { name: "Remove connection" }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("GitLab connection removed."),
    );
    expect(mocks.connectionDelete).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", connectionId: codeConnection.id },
    });
  });

  it("forgets a started removal when the row is closed", async () => {
    listing([webConnection]);
    renderPanel();
    await openRow();
    const website = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(website).getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("button", { name: "Remove connection" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^(Manage|Connect|View)/ }));
    await openRow();

    expect(screen.queryByRole("button", { name: "Remove connection" })).toBeNull();
  });

  it("treats a connection already removed elsewhere as removed", async () => {
    listing([webConnection]);
    mocks.connectionDelete.mockResolvedValue(new Response("{}", { status: 404 }));
    renderPanel();
    await openRow();
    const website = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(website).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(website).getByRole("button", { name: "Remove connection" }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("GitLab connection removed."),
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("shows the server's reason when removing fails", async () => {
    listing([webConnection]);
    mocks.connectionDelete.mockResolvedValue(
      Response.json({ error: "nope", message: "Still in use." }, { status: 409 }),
    );
    renderPanel();
    await openRow();
    const website = await screen.findByRole("listitem", { name: "Website" });
    fireEvent.click(within(website).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(website).getByRole("button", { name: "Remove connection" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Still in use."));
  });

  it("stops live checks still running when the row is closed", async () => {
    listing([webConnection]);
    let aborted = false;
    mocks.checkGet.mockImplementation(
      (_input: unknown, options: { init: { signal: AbortSignal } }) =>
        new Promise<Response>((_resolve, reject) => {
          options.init.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    renderPanel();
    await openRow();
    await screen.findByText("Checking the connection…");

    fireEvent.click(screen.getByRole("button", { name: /^(Manage|Connect|View)/ }));

    await waitFor(() => expect(aborted).toBe(true));
  });

  it("shows people who can't manage it the connections, with no buttons or form", async () => {
    listing([webConnection, codeConnection]);
    renderPanel({ disabled: true });
    await openRow();

    await screen.findByRole("listitem", { name: "Website" });
    expect(screen.queryByRole("button", { name: "Add connection" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.queryByLabelText("Access token")).toBeNull();
  });

  it("treats a role that can't read integrations as nothing to show, not an error", async () => {
    mocks.connectionsGet.mockImplementation(async () => new Response("{}", { status: 403 }));
    renderPanel({ disabled: true });

    expect(
      await screen.findByText(/Connect GitLab.com or your company's own GitLab server/),
    ).toBeTruthy();
    expect(screen.queryByText(/Unable to load/)).toBeNull();
  });

  it("offers no form when it can't tell what exists", async () => {
    mocks.connectionsGet.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderPanel();

    await screen.findByText(/Unable to load/);
    await openRow();

    expect(screen.queryByRole("button", { name: "Add connection" })).toBeNull();
    expect(screen.queryByLabelText("Access token")).toBeNull();
  });

  it("says so when a live check can't run", async () => {
    listing([webConnection]);
    mocks.checkGet.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderPanel();
    await openRow();

    expect(await screen.findByText("Couldn't check this connection just now.")).toBeTruthy();
  });
});
