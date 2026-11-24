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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { takeAutomationAssistantHandoff } from "@/lib/automation-assistant/handoff";

import { automationTemplatesFixture, createVisualWorkflowSummary } from "./automations.fixture";
import { AutomationsCreatePageContent } from "./automations-create-page-content";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createVisualWorkflow: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/automations/create",
}));

vi.mock("@/lib/navigation/use-org-router", () => ({
  useOrgRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("./visual-workflows-api", () => ({ createVisualWorkflowsApi: () => ({}) }));

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => ({ status: "allowed" }),
}));

vi.mock("@/components/billing/upgrade-plan-button", () => ({
  UpgradePlanButton: () => <button type="button">Upgrade plan</button>,
}));

function renderPage(props: Partial<ComponentProps<typeof AutomationsCreatePageContent>> = {}) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AutomationsCreatePageContent
          organizationSlug="acme"
          templates={automationTemplatesFixture}
          assistantEnabled
          workflowAccess="available"
          visualWorkflowsApi={{ createVisualWorkflow: mocks.createVisualWorkflow }}
          {...props}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AutomationsCreatePageContent", () => {
  it("hands what the person describes to the agent setup page", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole("textbox", { name: "Describe the automation" }),
      "Post a weekly summary to Slack",
    );
    await user.click(screen.getByRole("button", { name: "Set it up" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/org/acme/automations/new");
    });
    expect(takeAutomationAssistantHandoff()).toBe("Post a weekly summary to Slack");
  });

  it("opens the agent editor from the Agent card", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /^Agent/ }).getAttribute("href")).toBe(
      "/org/acme/automations/new",
    );
  });

  it("creates a workflow and opens its canvas from the Workflow card", async () => {
    const user = userEvent.setup();
    mocks.createVisualWorkflow.mockResolvedValue(createVisualWorkflowSummary());
    renderPage();

    await user.click(screen.getByRole("button", { name: /^Workflow/ }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        "/org/acme/automations/visual-workflows/33333333-3333-4333-8333-333333333333",
      );
    });
    expect(mocks.createVisualWorkflow).toHaveBeenCalledWith("acme");
  });

  it("features the localisation workflows before every other way to start", () => {
    renderPage();

    const featured = screen.getByRole("heading", { name: "Localisation workflows" });
    const other = screen.getByRole("heading", { name: "Other automations" });
    expect(featured.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      other.compareDocumentPosition(screen.getByRole("heading", { name: "What should happen?" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "AI translation on upload" })
        .getAttribute("aria-describedby"),
    ).toBeTruthy();
  });

  it("creates a workflow from a localisation template and opens its canvas", async () => {
    const user = userEvent.setup();
    mocks.createVisualWorkflow.mockResolvedValue(createVisualWorkflowSummary());
    renderPage();

    await user.click(screen.getByRole("button", { name: /^MTPE: AI translation, then post-edit/ }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(
        "/org/acme/automations/visual-workflows/33333333-3333-4333-8333-333333333333",
      );
    });
    expect(mocks.createVisualWorkflow).toHaveBeenCalledWith("acme", {
      definition: expect.objectContaining({
        name: "MTPE: AI translation, then post-edit",
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "trigger", type: "trigger.source_upload" }),
          expect.objectContaining({ id: "create_task", type: "action.create_task" }),
        ]),
      }),
    });
  });

  it("offers an upgrade on a plan without workflows", () => {
    renderPage({ workflowAccess: "upgrade" });

    expect(screen.queryByRole("button", { name: /^Workflow/ })).toBeNull();
    // The featured workflows stay visible to show what the upgrade brings, but cannot be started.
    expect(screen.getByRole("heading", { name: "Localisation workflows" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI translation on upload" })).toBeNull();
    expect(screen.getAllByText("Workflows come with a higher plan.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Upgrade plan" }).length).toBeGreaterThan(0);
  });

  it("says who can build a workflow to a role that cannot", () => {
    renderPage({ workflowAccess: "restricted" });

    expect(screen.queryByRole("button", { name: /^Workflow/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "AI translation on upload" })).toBeNull();
    expect(
      screen.getAllByText("Ask a workspace admin to build a workflow.").length,
    ).toBeGreaterThan(0);
  });

  it("starts agents alone in a project", () => {
    renderPage({ projectId: "proj_1", workflowAccess: "hidden" });

    expect(screen.queryByText("Workflow")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Localisation workflows" })).toBeNull();
    expect(screen.getByRole("link", { name: /^Agent/ }).getAttribute("href")).toBe(
      "/org/acme/projects/proj_1/automations/new",
    );
  });

  it("shows only templates that can be used, a few at a time", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByText("Coming soon")).toBeNull();
    const templateLinks = () =>
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.includes("?template="));
    expect(templateLinks()).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: /Show all \d+ templates/ }));
    expect(templateLinks().length).toBeGreaterThan(6);
  });
});
