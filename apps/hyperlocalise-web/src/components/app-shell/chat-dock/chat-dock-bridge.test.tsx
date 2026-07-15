// @vitest-environment happy-dom

import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { IntlProvider } from "react-intl";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";

import { ChatDockBridge, NEW_REQUEST_QUERY_PARAM } from "./chat-dock";
import { clearChatDockState } from "./chat-dock-persistence";
import { disposeChatStreamManager } from "./chat-stream-manager";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/dashboard",
}));

const TabCount = observer(function TabCount() {
  const { chatDock } = useAppShellStore();
  return <div data-testid="tab-count">{chatDock.tabs.length}</div>;
});

describe("ChatDockBridge newRequest bootstrap", () => {
  afterEach(() => {
    clearChatDockState("acme");
    disposeChatStreamManager("acme");
    window.history.replaceState(null, "", "/org/acme/dashboard");
  });

  it("opens one dock tab from ?newRequest=1 and clears the query", async () => {
    window.history.replaceState(null, "", `/org/acme/dashboard?${NEW_REQUEST_QUERY_PARAM}=1`);

    const { getByTestId } = render(
      <QueryClientProvider client={new QueryClient()}>
        <IntlProvider locale="en" messages={{}}>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <ChatDockBridge organizationSlug="acme" />
            <TabCount />
          </AppShellStoreProvider>
        </IntlProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(getByTestId("tab-count").textContent).toBe("1");
    });
    expect(window.location.search).toBe("");
  });

  it("does not open a tab when the query is absent", async () => {
    window.history.replaceState(null, "", "/org/acme/dashboard");

    const { getByTestId } = render(
      <QueryClientProvider client={new QueryClient()}>
        <IntlProvider locale="en" messages={{}}>
          <AppShellStoreProvider defaultNavigationGroups={[]}>
            <ChatDockBridge organizationSlug="acme" />
            <TabCount />
          </AppShellStoreProvider>
        </IntlProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByTestId("tab-count").textContent).toBe("0");
  });
});
