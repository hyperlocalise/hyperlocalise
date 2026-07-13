// @vitest-environment happy-dom

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";

import { ChatDockErrorBoundary } from "./chat-dock-error-boundary";
import { clearChatDockState } from "./chat-dock-persistence";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/dashboard",
}));

function InitializeOpenChatDock() {
  const { chatDock } = useAppShellStore();
  useState(() => {
    chatDock.setOrganizationSlug("acme");
    chatDock.openNewTab();
  });
  return null;
}

const ThrowingPanel = observer(function ThrowingPanel({ shouldThrow }: { shouldThrow: boolean }) {
  const { chatDock } = useAppShellStore();
  if (!chatDock.panelOpen) {
    return null;
  }
  if (shouldThrow) {
    throw new Error("Broken chat panel");
  }
  return <div>Recovered chat panel</div>;
});

function renderBoundary(shouldThrow: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <IntlProvider locale="en" messages={{}}>
        <AppShellStoreProvider defaultNavigationGroups={[]}>
          <InitializeOpenChatDock />
          <ChatDockErrorBoundary organizationSlug="acme">
            <ThrowingPanel shouldThrow={shouldThrow} />
          </ChatDockErrorBoundary>
          <a href="mailto:support@example.com">Email support</a>
        </AppShellStoreProvider>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("ChatDockErrorBoundary", () => {
  afterEach(() => {
    clearChatDockState("acme");
    vi.restoreAllMocks();
  });

  it("contains a panel render failure and keeps surrounding controls available", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBoundary(true);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Chat could not be displayed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email support" })).toBeTruthy();
  });

  it("retries the panel without replacing surrounding content", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = renderBoundary(true);

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <IntlProvider locale="en" messages={{}}>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <InitializeOpenChatDock />
            <ChatDockErrorBoundary organizationSlug="acme">
              <ThrowingPanel shouldThrow={false} />
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
});
