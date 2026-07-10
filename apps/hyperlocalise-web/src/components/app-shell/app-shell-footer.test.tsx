// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellFooter } from "@/components/app-shell/app-shell-footer";
import { planUsagePrimaryFeatureId } from "@/lib/billing/plan-usage";

const autumnMocks = vi.hoisted(() => ({
  useCustomer: vi.fn(),
  useListPlans: vi.fn(),
}));

vi.mock("autumn-js/react", () => autumnMocks);

afterEach(() => {
  autumnMocks.useCustomer.mockReset();
  autumnMocks.useListPlans.mockReset();
});

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

    render(<AppShellFooter organizationSlug="acme" showPlan />);

    await user.click(screen.getByRole("button", { name: "Open plan usage: Growth" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Your workspace is on the Growth plan")).toBeTruthy();
    expect(screen.getByText("25 / 100 AI credits used")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open billing" }).getAttribute("href")).toBe(
      "/org/acme/settings/billing#plan-usage",
    );
  });

  it("keeps support available without billing access", () => {
    render(<AppShellFooter organizationSlug="acme" showPlan={false} />);

    expect(screen.queryByText("Growth")).toBeNull();
    expect(screen.getByRole("link", { name: "Email support" }).getAttribute("href")).toBe(
      "mailto:minh@hyperlocalise.com",
    );
  });
});
