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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { takeAutomationAssistantHandoff } from "@/lib/automation-assistant/handoff";

import { automationTemplatesFixture, createAutomationSummary } from "./automations.fixture";
import { AutomationsPageContent } from "./automations-page-content";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listAutomations: vi.fn(),
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
            templates={[]}
            assistantEnabled
            automationsApi={automationsApi}
            {...props}
          />
        </AppShellStoreProvider>
      </QueryClientProvider>
    </IntlProvider>,
  );
}

const EMPTY_LIST_TEXT =
  "No automations yet. Start from a template below or create a new automation.";

function promptBox() {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Describe the automation" });
}

/** Resolves once the list request has settled and the page has taken its final layout. */
async function listLoaded() {
  await waitFor(() => {
    expect(screen.queryByLabelText("Loading automations")).toBeNull();
  });
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  mocks.listAutomations.mockResolvedValue([]);
  Element.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  vi.clearAllMocks();
  mocks.aiFeaturesStatus.status = "allowed";
  window.location.hash = "";
});

describe("AutomationsPageContent", () => {
  it("hands what the person asked for to the setup page", async () => {
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
    expect(promptBox().disabled).toBe(true);
  });

  it("sends a project's request to that project's setup page", async () => {
    const user = userEvent.setup();
    renderPage({ projectId: "proj_1" });

    await user.type(
      screen.getByRole("textbox", { name: "Describe the automation" }),
      "Translate new articles",
    );
    await user.click(screen.getByRole("button", { name: "Set it up" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/org/acme/projects/proj_1/automations/new");
    });
  });

  it("puts the new-automation section below the list of automations", async () => {
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    renderPage({ templates: automationTemplatesFixture });

    // The creator's name is only in the list; the automation's own name is also a template's.
    await screen.findByText("Ada Lovelace");
    const pageText = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { name: "New automation" })).toBeTruthy();
    expect(pageText.indexOf("Ada Lovelace")).toBeLessThan(pageText.indexOf("New automation"));
    expect(screen.getByRole("link", { name: "Start from scratch" }).getAttribute("href")).toBe(
      "/org/acme/automations/new",
    );
    expect(screen.getByText("or pick a template")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Templates" })).toBeNull();
  });

  it("shows the section in place of the list when there are no automations", async () => {
    renderPage();
    await listLoaded();

    expect(screen.getByRole("heading", { name: "New automation" })).toBeTruthy();
    expect(screen.queryByText(EMPTY_LIST_TEXT)).toBeNull();
    expect(screen.queryByText("Creator")).toBeNull();
  });

  it("keeps the list when it could not be loaded", async () => {
    mocks.listAutomations.mockRejectedValue(new Error("network down"));
    renderPage();

    expect(await screen.findByText("network down")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "New automation" })).toBeTruthy();
  });

  it("takes the person to the prompt box from the New Automation button", async () => {
    const user = userEvent.setup();
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    renderPage();
    await listLoaded();

    await user.click(screen.getByRole("button", { name: "New Automation" }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("new-automation"));
    expect(document.activeElement).toBe(promptBox());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("goes to the prompt box for someone who followed a link to the section", async () => {
    window.location.hash = "#new-automation";
    mocks.listAutomations.mockResolvedValue([createAutomationSummary()]);
    renderPage();
    await listLoaded();

    await waitFor(() => {
      expect(document.activeElement).toBe(promptBox());
    });
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("offers an upgrade in place of the prompt, and opens the editor, without AI features", async () => {
    mocks.aiFeaturesStatus.status = "denied";
    renderPage();
    await listLoaded();

    expect(screen.getByText("The assistant needs a plan with AI features.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Describe the automation" })).toBeNull();
    expect(screen.getByRole("link", { name: "New Automation" }).getAttribute("href")).toBe(
      "/org/acme/automations/new",
    );
    expect(screen.getByRole("link", { name: "Start from scratch" })).toBeTruthy();
  });

  it("is the list and the templates, as before, without the assistant", async () => {
    renderPage({ assistantEnabled: false, templates: automationTemplatesFixture });
    await listLoaded();

    expect(screen.getByText(EMPTY_LIST_TEXT)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Templates" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "New Automation" }).getAttribute("href")).toBe(
      "/org/acme/automations/new",
    );
    expect(screen.queryByRole("heading", { name: "New automation" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start from scratch" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Describe the automation" })).toBeNull();
    expect(screen.queryByText("The assistant needs a plan with AI features.")).toBeNull();
  });
});
