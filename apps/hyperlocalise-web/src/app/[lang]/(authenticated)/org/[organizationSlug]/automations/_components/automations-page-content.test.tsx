// @vitest-environment happy-dom

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

import type { ComponentProps, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { takeAutomationAssistantHandoff } from "@/lib/automation-assistant/handoff";

import { createAutomationSummary, createVisualWorkflowSummary } from "./automations.fixture";
import { AutomationsPageContent } from "./automations-page-content";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listAutomations: vi.fn(),
  listVisualWorkflows: vi.fn(),
  aiFeaturesStatus: { status: "allowed" as "loading" | "allowed" | "denied" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/automations",
}));

vi.mock("@/lib/navigation/use-org-router", () => ({
  useOrgRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api-client-instance", () => ({ apiClient: {} }));

vi.mock("./automations-api", () => ({ createAutomationsApi: () => ({}) }));

vi.mock("./visual-workflows-api", () => ({ createVisualWorkflowsApi: () => ({}) }));

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => mocks.aiFeaturesStatus,
}));

const automationsApi = {
  listAutomations: mocks.listAutomations,
  getGithubAutoReviewSettings: vi.fn().mockResolvedValue(null),
  updateGithubAutoReviewSettings: vi.fn(),
} as unknown as NonNullable<ComponentProps<typeof AutomationsPageContent>["automationsApi"]>;

function renderPage(props: Partial<ComponentProps<typeof AutomationsPageContent>> = {}) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AppShellStoreProvider defaultNavigationGroups={[]}>
          <AutomationsPageContent
            organizationSlug="acme"
            assistantEnabled
            automationsApi={automationsApi}
            visualWorkflowsApi={{ listVisualWorkflows: mocks.listVisualWorkflows }}
            {...props}
          />
        </AppShellStoreProvider>
      </QueryClientProvider>
    </IntlProvider>,
  );
}

function promptBox() {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Describe the automation" });
}

/** Resolves once the list request has settled and the page has taken its final layout. */
async function listLoaded() {
  await waitFor(() => {
    expect(screen.queryByLabelText("Loading automations")).toBeNull();
  });
}

beforeEach(() => {
  mocks.listAutomations.mockResolvedValue([]);
  mocks.listVisualWorkflows.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  mocks.aiFeaturesStatus.status = "allowed";
});

describe("AutomationsPageContent", () => {
  it("sends New automation to the page where a new automation starts", async () => {
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    renderPage();
    await listLoaded();

    expect(screen.getByRole("link", { name: "New automation" }).getAttribute("href")).toBe(
      "/org/acme/automations/create",
    );
    expect(screen.queryByRole("textbox", { name: "Describe the automation" })).toBeNull();
  });

  it("lists agents and workflows together for someone who can open workflows", async () => {
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    mocks.listVisualWorkflows.mockResolvedValue([createVisualWorkflowSummary()]);
    renderPage({ canOpenVisualWorkflows: true });

    const workflowRow = await screen.findByRole("link", { name: /Release localisation check/ });
    expect(workflowRow.getAttribute("href")).toBe(
      "/org/acme/automations/visual-workflows/33333333-3333-4333-8333-333333333333",
    );
    expect(within(workflowRow).getByText("Workflow")).toBeTruthy();
    expect(within(workflowRow).getByText("Manual → 2 steps")).toBeTruthy();
    const agentRow = screen.getByRole("link", { name: /Validate localisation on push/ });
    expect(within(agentRow).getByText("Agent")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Draft 1" })).toBeTruthy();
  });

  it("does not ask for workflows without access to them", async () => {
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    renderPage();
    await listLoaded();

    expect(mocks.listVisualWorkflows).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: "Type" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Draft/ })).toBeNull();
  });

  it("opens on workflows alone when the address asks for them", async () => {
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    mocks.listVisualWorkflows.mockResolvedValue([createVisualWorkflowSummary()]);
    renderPage({ canOpenVisualWorkflows: true, initialTypeFilter: "workflow" });

    expect(await screen.findByText("Release localisation check")).toBeTruthy();
    expect(screen.queryByText("Validate localisation on push")).toBeNull();
  });

  it("filters by status and by name, and clears the filters", async () => {
    const user = userEvent.setup();
    mocks.listAutomations.mockResolvedValue([
      createAutomationSummary(),
      createAutomationSummary({ id: "paused", name: "Weekly sync", status: "paused" }),
    ]);
    renderPage();
    await listLoaded();

    await user.click(screen.getByRole("tab", { name: "Paused 1" }));
    expect(screen.getByText("Weekly sync")).toBeTruthy();
    expect(screen.queryByText("Validate localisation on push")).toBeNull();

    await user.type(screen.getByRole("searchbox", { name: "Search automations" }), "release");
    expect(screen.getByText("No automations match these filters.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Weekly sync")).toBeTruthy();
    expect(screen.getByText("Validate localisation on push")).toBeTruthy();
  });

  it("shows when the latest run failed", async () => {
    mocks.listAutomations.mockResolvedValue([
      createAutomationSummary({
        lastRunStatus: "failed",
        lastRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      }),
    ]);
    renderPage();

    expect(await screen.findByText("Failed · 2h")).toBeTruthy();
  });

  it("explains automations and offers the prompt box to a workspace with none", async () => {
    const user = userEvent.setup();
    renderPage();
    await listLoaded();

    expect(
      screen.getByRole("heading", { name: "Put your localisation work on autopilot" }),
    ).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "Search automations" })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse templates" }).getAttribute("href")).toBe(
      "/org/acme/automations/create",
    );

    await user.type(promptBox(), "Post a weekly summary to Slack");
    await user.click(screen.getByRole("button", { name: "Set it up" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/org/acme/automations/new");
    });
    expect(takeAutomationAssistantHandoff()).toBe("Post a weekly summary to Slack");
    expect(promptBox().disabled).toBe(true);
  });

  it("sends a project's request to that project's setup page", async () => {
    const user = userEvent.setup();
    renderPage({ projectId: "proj_1" });
    await listLoaded();

    await user.type(promptBox(), "Translate new articles");
    await user.click(screen.getByRole("button", { name: "Set it up" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/org/acme/projects/proj_1/automations/new");
    });
  });

  it("keeps the list when it could not be loaded", async () => {
    mocks.listAutomations.mockRejectedValue(new Error("network down"));
    renderPage();

    expect(await screen.findByText("network down")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Put your localisation work on autopilot" }),
    ).toBeNull();
  });

  it("leaves the prompt box out without the assistant", async () => {
    renderPage({ assistantEnabled: false });
    await listLoaded();

    expect(
      screen.getByRole("heading", { name: "Put your localisation work on autopilot" }),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Describe the automation" })).toBeNull();
  });
});
