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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ReportsPage } from "./reports-page";
import {
  createReportsSettings,
  reportsResponseBodies,
  type ReportsApiCall,
} from "./reports.fixture";

const mocks = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/en/org/acme/reports",
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("@/lib/api-client-instance", async () => ({
  apiClient: (await import("./reports.fixture")).reportsApiClient(mocks),
}));

function renderPage(projectId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <ReportsPage organizationSlug="acme" projectId={projectId} />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

const callsTo = (endpoint: string) => mocks.calls.filter((call) => call.endpoint === endpoint);
const filterLabels = () =>
  Array.from(document.querySelectorAll("[data-slot=field-label]")).map(
    (label) => label.textContent,
  );

beforeEach(() => {
  mocks.search = "";
  mocks.replace.mockClear();
  mocks.calls.length = 0;
  mocks.bodies = reportsResponseBodies();
});

describe("Reports page", () => {
  it("shows every tab to roles that see costs, and the period's headline numbers", async () => {
    renderPage();
    expect(await screen.findByText("48,210")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Activity",
      "Word counts",
      "Time",
      "Costs",
      "Cost estimate",
      "Budgets",
    ]);
    expect(
      screen.getByText("Reporting started Mar 3, 2026 · Days and weeks use UTC"),
    ).toBeInTheDocument();
    // Activity changes are neutral sentences against the previous 28 days.
    expect(screen.getByText("+12% vs previous 28 days")).toBeInTheDocument();
    expect(screen.getAllByText(/points vs previous 28 days/).length).toBeGreaterThan(0);
  });

  it("hides the money tabs from other roles, even when the URL asks for one", async () => {
    mocks.bodies = reportsResponseBodies(
      createReportsSettings({ financial: false, canManage: false }),
    );
    mocks.search = "tab=costs";
    renderPage();
    expect(await screen.findByText("Source words")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Activity",
      "Word counts",
      "Time",
    ]);
    for (const endpoint of ["costs", "cost-estimate", "budgets", "rate-cards"])
      expect(callsTo(endpoint)).toEqual([]);
  });

  it("shows only the filters the open tab uses", async () => {
    mocks.search = "tab=estimate";
    const { unmount } = renderPage();
    expect(await screen.findByText("Choose tasks to estimate")).toBeInTheDocument();
    expect(filterLabels()).toEqual(["Project", "Tasks", "Language", "Rate card"]);
    expect(screen.getByRole("button", { name: "Manage rates" })).toBeInTheDocument();
    // No tasks chosen, so nothing is estimated.
    expect(callsTo("cost-estimate")).toEqual([]);
    unmount();

    mocks.search = "tab=budgets";
    renderPage();
    expect(await screen.findByText("Web app")).toBeInTheDocument();
    expect(filterLabels()).toEqual(["Project"]);
  });

  it("reads the tab and filters from the URL and writes changes back", async () => {
    mocks.search = "tab=words&range=7&unit=characters&group=task";
    renderPage();
    await waitFor(() => expect(callsTo("words")).toHaveLength(1));
    expect(callsTo("words")[0].args.query).toMatchObject({
      from: "2026-10-15",
      to: "2026-10-21",
      unit: "characters",
      groupBy: "task",
      mode: "arrived",
      page: "1",
    });
    await userEvent.click(screen.getByRole("button", { name: "Strings" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=words&range=7&unit=strings&group=task",
        { scroll: false },
      ),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Time" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=time&range=7&unit=strings&group=task",
        { scroll: false },
      ),
    );
  });

  it("fixes the project on a project's own Reports page", async () => {
    renderPage("project_web");
    expect(await screen.findByText("Source words")).toBeInTheDocument();
    expect(filterLabels()).not.toContain("Project");
    await waitFor(() =>
      expect(callsTo("activity")[0]?.args.query).toMatchObject({ projectId: "project_web" }),
    );
  });

  it("estimates the chosen tasks and leaves a language without a rate blank", async () => {
    mocks.search = "tab=estimate&tasks=job_release,job_billing";
    renderPage();
    const table = await screen.findByRole("table", { name: "Cost estimate" });
    expect(callsTo("cost-estimate")[0].args.query).toMatchObject({
      jobIds: "job_release,job_billing",
      rateCard: "Standard 2026",
    });
    const rows = within(table).getAllByRole("row");
    expect(rows.find((row) => row.textContent?.includes("ko-KR"))?.textContent).toContain(
      "No rate",
    );
    expect(rows.find((row) => row.textContent?.includes("de-DE"))?.textContent).toContain(
      "$0.12 / word",
    );
    expect(screen.getByText(/ko-KR has no rate on this rate card/)).toBeInTheDocument();
  });
});
