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

const mocks = vi.hoisted(() => ({
  connectionGet: vi.fn(),
  checkGet: vi.fn(),
  connectionPut: vi.fn(),
  connectionDelete: vi.fn(),
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
            connection: {
              $get: mocks.connectionGet,
              $put: mocks.connectionPut,
              $delete: mocks.connectionDelete,
              check: { $get: mocks.checkGet },
            },
          },
        },
      },
    },
  }),
}));

import { GitLabServerConnectionPanel } from "./gitlab-server-connection-panel";

const savedConnection = {
  serverUrl: "https://git.acme.example",
  connectedUsername: "translations-bot",
  maskedTokenSuffix: "••••abcd",
  updatedAt: "2026-11-03T00:00:00.000Z",
};

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

describe("GitLabServerConnectionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectionGet.mockImplementation(async () => Response.json({ gitlabConnection: null }));
    mocks.checkGet.mockImplementation(async () => Response.json({ working: true }));
    mocks.connectionPut.mockResolvedValue(Response.json({ gitlabConnection: savedConnection }));
    mocks.connectionDelete.mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("saves only once both the address and token are filled in, then clears the token", async () => {
    renderPanel();
    await openRow();

    const save = await screen.findByRole("button", { name: "Check and save" });
    expect(save).toHaveProperty("disabled", true);

    const token = screen.getByLabelText("Access token");
    fireEvent.change(token, { target: { value: "glpat-secret" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(token, { target: { value: "" } });

    fireEvent.change(screen.getByLabelText("Server address"), {
      target: { value: "https://git.acme.example" },
    });
    expect(save).toHaveProperty("disabled", true);

    fireEvent.change(token, { target: { value: "glpat-secret" } });
    fireEvent.click(save);

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.connectionPut).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      json: { serverUrl: "https://git.acme.example", accessToken: "glpat-secret" },
    });
    expect(token).toHaveProperty("value", "");
  });

  it("shows the server's reason when saving fails, and keeps what was typed", async () => {
    mocks.connectionPut.mockResolvedValue(
      Response.json({ message: "The server refused this token." }, { status: 400 }),
    );
    renderPanel();
    await openRow();

    fireEvent.change(await screen.findByLabelText("Server address"), {
      target: { value: "https://git.acme.example" },
    });
    const token = screen.getByLabelText("Access token");
    fireEvent.change(token, { target: { value: "glpat-bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("The server refused this token."),
    );
    expect(token).toHaveProperty("value", "glpat-bad");
  });

  it("describes a saved connection and asks for the token again to change it", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    renderPanel();

    expect(
      await screen.findByText("Connected to https://git.acme.example as translations-bot."),
    ).toBeTruthy();
    expect(mocks.checkGet).not.toHaveBeenCalled();

    await openRow();

    expect(await screen.findByText(/The connection is working/)).toBeTruthy();
    expect(screen.getByLabelText("Server address")).toHaveProperty(
      "value",
      "https://git.acme.example",
    );
    expect(screen.getByRole("button", { name: "Check and save" })).toHaveProperty("disabled", true);
  });

  it("says why a saved connection stopped working", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    mocks.checkGet.mockImplementation(async () =>
      Response.json({ working: false, message: "The server refused this token." }),
    );
    renderPanel();
    await openRow();

    expect(await screen.findByText(/The server refused this token/)).toBeTruthy();
  });

  it("doesn't check again right after a save, only when the row is opened again", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    renderPanel();
    await openRow();
    await screen.findByText(/The connection is working/);
    expect(mocks.checkGet).toHaveBeenCalledTimes(1);

    const resaved = { ...savedConnection, updatedAt: "2026-11-03T00:05:00.000Z" };
    mocks.connectionPut.mockImplementation(async () =>
      Response.json({ gitlabConnection: resaved }),
    );
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: resaved }),
    );
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "glpat-new" } });
    fireEvent.click(screen.getByRole("button", { name: "Check and save" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    await screen.findByText(/The connection is working/);
    expect(mocks.checkGet).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^(Manage|Connect|View)/ }));
    await openRow();
    await waitFor(() => expect(mocks.checkGet).toHaveBeenCalledTimes(2));
  });

  it("forgets a started disconnect when the row is closed", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    renderPanel();
    await openRow();
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

    fireEvent.click(screen.getByRole("button", { name: /^(Manage|Connect|View)/ }));
    await openRow();

    expect(await screen.findByRole("button", { name: "Disconnect" })).toBeTruthy();
    expect(screen.queryByText(/Disconnect for the whole workspace/)).toBeNull();
  });

  it("asks before disconnecting the whole workspace, and can be cancelled", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    renderPanel();
    await openRow();

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(screen.getByText(/Disconnect for the whole workspace/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.connectionDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect server" }));

    await waitFor(() => expect(mocks.connectionDelete).toHaveBeenCalled());
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Access token")).toBeNull());
  });

  it("treats a connection already removed elsewhere as disconnected", async () => {
    let connected = true;
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: connected ? savedConnection : null }),
    );
    mocks.connectionDelete.mockImplementation(async () => {
      connected = false;
      return Response.json({ message: "GitLab connection not found." }, { status: 404 });
    });
    renderPanel();
    await openRow();

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect server" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /^Connect/ })).toBeTruthy();
  });

  it("shows the server's reason when disconnecting fails", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    mocks.connectionDelete.mockResolvedValue(
      Response.json({ message: "You can't change this connection." }, { status: 403 }),
    );
    renderPanel();
    await openRow();

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect server" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("You can't change this connection."),
    );
  });

  it("stops a live check that is still running when the row is closed", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    let checkSignal: AbortSignal | undefined;
    mocks.checkGet.mockImplementation(
      (_args: unknown, options?: { init?: { signal?: AbortSignal } }) => {
        checkSignal = options?.init?.signal;
        return new Promise<Response>(() => {});
      },
    );
    renderPanel();
    await openRow();
    await waitFor(() => expect(checkSignal).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /^(Manage|Connect|View)/ }));

    await waitFor(() => expect(checkSignal?.aborted).toBe(true));
  });

  it("shows people who can't manage it the connection, with no form", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    renderPanel({ disabled: true });
    await openRow();

    await screen.findByText(/The connection is working/);
    expect(screen.queryByLabelText("Access token")).toBeNull();
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  });

  it("treats a role that can't read integrations as nothing to show, not an error", async () => {
    mocks.connectionGet.mockImplementation(async () => new Response("{}", { status: 403 }));
    renderPanel({ disabled: true });

    expect(await screen.findByText(/Use your company's own GitLab server/)).toBeTruthy();
    expect(screen.queryByText(/Unable to load/)).toBeNull();
  });

  it("offers no form when it can't tell whether a connection exists", async () => {
    mocks.connectionGet.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderPanel();

    await screen.findByText(/Unable to load/);
    await openRow();

    expect(screen.queryByLabelText("Access token")).toBeNull();
  });

  it("says so when the live check can't run", async () => {
    mocks.connectionGet.mockImplementation(async () =>
      Response.json({ gitlabConnection: savedConnection }),
    );
    mocks.checkGet.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderPanel();
    await openRow();

    expect(await screen.findByText("Couldn't check this connection just now.")).toBeTruthy();
  });
});
