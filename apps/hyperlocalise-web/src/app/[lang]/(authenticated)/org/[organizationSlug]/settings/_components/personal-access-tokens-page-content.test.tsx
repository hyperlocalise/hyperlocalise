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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AccessTokenSummary } from "./access-token-lifecycle";

const { getMock, postMock, deleteMock, toastErrorMock, toastSuccessMock, writeTextMock } =
  vi.hoisted(() => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    deleteMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    writeTextMock: vi.fn(),
  }));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "api-keys": {
            $get: (...args: unknown[]) => getMock(...args),
            $post: (...args: unknown[]) => postMock(...args),
            ":apiKeyId": {
              $delete: (...args: unknown[]) => deleteMock(...args),
            },
          },
        },
      },
    },
  },
}));

import { PersonalAccessTokensPageContent } from "./personal-access-tokens-page-content";

const CURRENT_USER_ID = "user_1";
const CREATED_SECRET = "hl_secret_value_once";

function createToken(overrides: Partial<AccessTokenSummary> = {}): AccessTokenSummary {
  return {
    id: "token_1",
    name: "Local CLI",
    keyPrefix: "hl_AbCd",
    permissions: ["jobs:read", "files:read"],
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-08-01T15:30:00.000Z",
    owner: {
      userId: CURRENT_USER_ID,
      email: "me@example.com",
      firstName: null,
      lastName: null,
    },
    ...overrides,
  };
}

function mockList(tokens: AccessTokenSummary[], options?: { ok?: boolean }) {
  getMock.mockResolvedValue({
    ok: options?.ok ?? true,
    json: async () => ({ apiKeys: tokens }),
  });
}

function renderPage(options?: { canManageTokens?: boolean }) {
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

  return render(
    <PersonalAccessTokensPageContent
      canManageTokens={options?.canManageTokens ?? true}
      currentUserId={CURRENT_USER_ID}
      organizationSlug="acme"
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  writeTextMock.mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: { writeText: writeTextMock },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PersonalAccessTokensPageContent", () => {
  it("hides create and revoke actions when token management is disabled", async () => {
    mockList([createToken()]);

    renderPage({ canManageTokens: false });

    await waitFor(() => {
      expect(screen.getByText("Local CLI")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Create token" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("lists owned tokens with last-used state and revocation status", async () => {
    mockList([
      createToken(),
      createToken({
        id: "token_2",
        name: "CI bot",
        keyPrefix: "hl_XyZ1",
        lastUsedAt: "2026-08-02T09:00:00.000Z",
        revokedAt: "2026-08-03T12:00:00.000Z",
      }),
      createToken({
        id: "token_3",
        name: "Someone else",
        owner: {
          userId: "user_2",
          email: "them@example.com",
          firstName: null,
          lastName: null,
        },
      }),
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Local CLI")).toBeInTheDocument();
    });
    expect(screen.getByText("CI bot")).toBeInTheDocument();
    expect(screen.queryByText("Someone else")).not.toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.queryByText(/Created Aug 1, 2026/)).not.toBeInTheDocument();
    expect(screen.getByText(/Aug 2, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });

  it("shows the full secret once after creation and hides it after dismissal", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    postMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKey: {
          id: "token_new",
          name: "Local CLI",
          key: CREATED_SECRET,
          keyPrefix: "hl_secre",
        },
      }),
    });
    getMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKeys: [] }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          apiKeys: [createToken({ id: "token_new", keyPrefix: "hl_secre" })],
        }),
      });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Create token" }));
    const createDialog = screen.getByRole("dialog");
    await user.type(within(createDialog).getByLabelText("Token name"), "Local CLI");
    await user.click(within(createDialog).getByRole("checkbox", { name: "Write jobs" }));
    await user.click(within(createDialog).getByRole("button", { name: "Create token" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(CREATED_SECRET)).toBeInTheDocument();
    });
    expect(postMock).toHaveBeenCalledWith({
      param: { organizationSlug: "acme" },
      json: {
        name: "Local CLI",
        permissions: ["jobs:read", "files:read", "files:write"],
      },
    });

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(CREATED_SECRET);

    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue(CREATED_SECRET)).not.toBeInTheDocument();
    });
    expect(screen.getByText("Local CLI")).toBeInTheDocument();
    expect(screen.queryByText(CREATED_SECRET)).not.toBeInTheDocument();
  });

  it("shows a failed creation error without disclosing a secret", async () => {
    const user = userEvent.setup();
    mockList([]);
    postMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "forbidden" }),
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Create token" }));
    await user.type(screen.getByLabelText("Token name"), "Broken token");
    await user.click(screen.getByRole("button", { name: "Create token" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("forbidden");
    });
    expect(screen.queryByDisplayValue(/hl_/)).not.toBeInTheDocument();
  });

  it("identifies the token by name and prefix when revoking", async () => {
    const user = userEvent.setup();
    mockList([createToken()]);
    deleteMock.mockResolvedValue({ ok: true });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(
      screen.getByText(
        "Revoke Local CLI (hl_AbCd…)? Integrations using this token will lose access immediately.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoke token" }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", apiKeyId: "token_1" },
      });
      expect(toastSuccessMock).toHaveBeenCalledWith("Personal access token revoked");
    });
  });

  it("shows a failed revocation error and keeps the token listed", async () => {
    const user = userEvent.setup();
    mockList([createToken()]);
    deleteMock.mockResolvedValue({ ok: false });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke token" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Failed to revoke personal access token");
    });
    expect(screen.getByText("Local CLI")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText(/Revoke Local CLI/)).toBeInTheDocument();
  });

  it("renders the empty, loading, and error states", async () => {
    getMock.mockReturnValue(new Promise(() => undefined));
    const loading = renderPage();
    expect(screen.getByText("Loading personal access tokens...")).toBeInTheDocument();
    loading.unmount();

    getMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const errored = renderPage();
    await waitFor(() => {
      expect(screen.getByText("Personal access tokens failed to load.")).toBeInTheDocument();
    });
    errored.unmount();

    mockList([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No personal access tokens yet")).toBeInTheDocument();
    });
  });
});
