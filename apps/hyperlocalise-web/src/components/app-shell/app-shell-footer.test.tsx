// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { IntlProvider } from "react-intl";

import { AppShellFooter } from "@/components/app-shell/app-shell-footer";
import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { planUsagePrimaryFeatureId } from "@/lib/billing/plan-usage";

const autumnMocks = vi.hoisted(() => ({
  useCustomer: vi.fn(),
  useListPlans: vi.fn(),
}));

vi.mock("autumn-js/react", () => autumnMocks);

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/dashboard",
}));

afterEach(() => {
  autumnMocks.useCustomer.mockReset();
  autumnMocks.useListPlans.mockReset();
});

function renderFooter(
  props: {
    organizationSlug?: string;
    showPlan?: boolean;
    withChat?: boolean;
  } = {},
) {
  const { organizationSlug = "acme", showPlan = true, withChat = false } = props;

  return render(
    <QueryClientProvider client={new QueryClient()}>
      <IntlProvider locale="en" messages={{}}>
        <AppShellStoreProvider defaultNavigationGroups={[]}>
          <AppShellFooter
            organizationSlug={organizationSlug}
            showPlan={showPlan}
            currentUser={
              withChat
                ? {
                    avatarUrl: null,
                    email: "user@example.com",
                    name: "Test User",
                  }
                : undefined
            }
          />
        </AppShellStoreProvider>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("AppShellFooter", () => {
  it("opens plan usage from the fixed footer control", async () => {
    const user = userEvent.setup();
    autumnMocks.useCustomer.mockReturnValue({
      data: {
        subscriptions: [
          {
            planId: "growth",
            status: "active",
            plan: { name: "Growth" },
          },
        ],
        balances: {
          [planUsagePrimaryFeatureId]: {
            usage: 25,
            granted: 100,
            remaining: 75,
          },
        },
      },
      isLoading: false,
      error: null,
    });
    autumnMocks.useListPlans.mockReturnValue({
      data: [{ id: "growth", name: "Growth" }],
      isLoading: false,
      error: null,
    });

    renderFooter({ showPlan: true });

    await user.click(screen.getByRole("button", { name: "Open plan usage: Growth" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Your workspace is on the Growth plan")).toBeTruthy();
    expect(screen.getByText("25 / 100 AI credits used")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open billing" }).getAttribute("href")).toBe(
      "/org/acme/settings/billing#plan-usage",
    );
  });

  it("keeps support available without billing access", () => {
    renderFooter({ showPlan: false });

    expect(screen.queryByText("Growth")).toBeNull();
    expect(screen.getByRole("link", { name: "Email support" }).getAttribute("href")).toBe(
      "mailto:minh@hyperlocalise.com",
    );
  });

  it("hosts chat tabs on the right of the footer status row with support", async () => {
    const user = userEvent.setup();
    autumnMocks.useCustomer.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    autumnMocks.useListPlans.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    renderFooter({ showPlan: false, withChat: true });

    const newChat = screen.getByRole("button", { name: "New chat" });
    const support = screen.getByRole("link", { name: "Email support" });
    expect(newChat.closest("footer")).toBeTruthy();
    expect(support.closest("footer")).toBeTruthy();
    expect(
      newChat.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(newChat);
    const tablist = screen.getByRole("tablist", { name: "Chat conversations" });
    expect(tablist.closest("footer")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /New chat/i })).toBeTruthy();
  });
});
