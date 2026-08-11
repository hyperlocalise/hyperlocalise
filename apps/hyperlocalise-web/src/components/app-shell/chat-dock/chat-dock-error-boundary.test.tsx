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

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";

import { ChatDockErrorBoundary } from "./chat-dock-error-boundary";
import { clearChatDockState } from "./chat-dock-persistence";
import { disposeChatStreamManager } from "./chat-stream-manager";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/dashboard",
}));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function InitializeFailedChatDock() {
  const { chatDock } = useAppShellStore();
  useState(() => {
    chatDock.setOrganizationSlug("acme");
    // Strict Mode remounts can hydrate a prior tab; start from a single failed tab.
    const existingTabIds = chatDock.tabs.map((tab) => tab.id);
    for (const tabId of existingTabIds) {
      chatDock.closeTab(tabId);
    }
    const tabId = chatDock.openNewTab();
    chatDock.setStreamSnapshot(tabId, {
      conversationId: tabId,
      responseToMessageId: "msg_1",
      message: {
        id: "assistant_1",
        role: "assistant",
        parts: [{ type: "text", text: "partial reply", state: "done" }],
      },
      status: "error",
    });
    chatDock.setLastError(tabId, "stale stream failure");
  });
  return null;
}

const ThrowingPanel = observer(function ThrowingPanel({
  throwWhenLastError,
}: {
  throwWhenLastError: boolean;
}) {
  const { chatDock } = useAppShellStore();
  if (!chatDock.panelOpen) {
    return null;
  }
  if (throwWhenLastError && chatDock.activeTab?.lastError) {
    throw new Error("Broken chat panel with user text: please translate this secret");
  }
  return <div>Recovered chat panel</div>;
});

const ChatDockProbe = observer(function ChatDockProbe() {
  const { chatDock } = useAppShellStore();
  // The failed tab is the one that still carries the seeded error / snapshot before recovery,
  // or — after openNewTab — the non-active tab that originally failed.
  const failedTab =
    chatDock.tabs.find((tab) => tab.id !== chatDock.activeTabId) ??
    chatDock.tabs.find((tab) => tab.lastError || tab.streamSnapshot) ??
    chatDock.tabs[0];
  const failedTabId = failedTab?.id ?? "";

  return (
    <div>
      <span data-testid="active-tab-id">{chatDock.activeTabId}</span>
      <span data-testid="failed-tab-id">{failedTabId}</span>
      <span data-testid="failed-tab-error">{failedTab?.lastError ?? ""}</span>
      <span data-testid="failed-tab-snapshot">
        {failedTab?.streamSnapshot ? "present" : "cleared"}
      </span>
      <button type="button" onClick={() => chatDock.openNewTab()}>
        Open second tab
      </button>
      <button
        type="button"
        onClick={() => {
          if (failedTabId) {
            chatDock.selectTab(failedTabId);
          }
        }}
      >
        Select first tab
      </button>
    </div>
  );
});

function renderBoundary(throwWhenLastError: boolean, { withProbe = false } = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <IntlProvider locale="en" messages={{}}>
        <AppShellStoreProvider defaultNavigationGroups={[]}>
          <InitializeFailedChatDock />
          <ChatDockErrorBoundary organizationSlug="acme">
            <ThrowingPanel throwWhenLastError={throwWhenLastError} />
          </ChatDockErrorBoundary>
          {withProbe ? <ChatDockProbe /> : null}
          <a href="mailto:support@example.com">Email support</a>
        </AppShellStoreProvider>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("ChatDockErrorBoundary", () => {
  beforeEach(() => {
    clearChatDockState("acme");
    disposeChatStreamManager("acme");
  });

  afterEach(() => {
    clearChatDockState("acme");
    disposeChatStreamManager("acme");
    vi.restoreAllMocks();
  });

  it("contains a panel render failure and keeps surrounding controls available", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBoundary(true);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Chat could not be displayed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email support" })).toBeTruthy();
  });

  it("logs only safe error metadata without message or stack", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBoundary(true);

    expect(consoleError).toHaveBeenCalled();
    const panelLogCall = consoleError.mock.calls.find((call) => call[0] === "[chat-dock:panel]");
    expect(panelLogCall).toBeTruthy();
    const payload = panelLogCall?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ name: "Error" });
    expect(payload).not.toHaveProperty("message");
    expect(payload).not.toHaveProperty("stack");
    expect(JSON.stringify(payload)).not.toContain("please translate this secret");
  });

  it("retries the panel without replacing surrounding content", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = renderBoundary(true);

    view.rerender(
      <QueryClientProvider client={createQueryClient()}>
        <IntlProvider locale="en" messages={{}}>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <InitializeFailedChatDock />
            <ChatDockErrorBoundary organizationSlug="acme">
              <ThrowingPanel throwWhenLastError={false} />
            </ChatDockErrorBoundary>
            <a href="mailto:support@example.com">Email support</a>
          </AppShellStoreProvider>
        </IntlProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered chat panel")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email support" })).toBeTruthy();
  });

  it("closes the failed panel without deleting the active tab", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBoundary(true);
    await user.click(screen.getByRole("button", { name: "Close chat" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Email support" })).toBeTruthy();
  });

  it("cleans up the failed tab when switching away via resetKeys", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBoundary(true, { withProbe: true });

    const failedTabId = screen.getByTestId("active-tab-id").textContent;
    expect(failedTabId).toBeTruthy();
    expect(screen.getByTestId("failed-tab-error").textContent).toBe("stale stream failure");
    expect(screen.getByTestId("failed-tab-snapshot").textContent).toBe("present");

    await user.click(screen.getByRole("button", { name: "Open second tab" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("active-tab-id").textContent).not.toBe(failedTabId);

    await waitFor(() => {
      expect(screen.getByTestId("failed-tab-error").textContent).toBe("");
      expect(screen.getByTestId("failed-tab-snapshot").textContent).toBe("cleared");
    });

    await user.click(screen.getByRole("button", { name: "Select first tab" }));

    expect(screen.getByTestId("active-tab-id").textContent).toBe(failedTabId);
    expect(screen.getByText("Recovered chat panel")).toBeTruthy();
  });
});
