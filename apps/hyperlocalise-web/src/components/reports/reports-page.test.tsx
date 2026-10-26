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
  reportsAiUsage,
  reportsCostEstimate,
  reportsCosts,
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
      "AI usage",
      "Costs",
      "Cost estimate",
      "Budgets",
    ]);
    // AI usage has its own tab now: the Activity tab reads none.
    expect(callsTo("ai-usage")).toEqual([]);
    expect(
      screen.getByText("Reporting started Mar 3, 2026 · Days and weeks use UTC"),
    ).toBeInTheDocument();
    // Activity changes are neutral sentences against the previous 28 days.
    expect(screen.getByText("+12% vs previous 28 days")).toBeInTheDocument();
    expect(screen.getAllByText(/points vs previous 28 days/).length).toBeGreaterThan(0);
  });

  it("shows other roles only their own time, even when the URL asks for another tab", async () => {
    mocks.bodies = reportsResponseBodies(
      createReportsSettings({ financial: false, canManage: false }),
    );
    mocks.search = "tab=costs";
    renderPage();
    expect(await screen.findByRole("tab", { name: "Time" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Time"]);
    expect(await screen.findByRole("button", { name: "Log time" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "You see the time you logged. The other reports are for admins and localization managers.",
      ),
    ).toBeInTheDocument();
    // No automated time card: the member's time body has none.
    expect(screen.queryByText("Automated step run time")).not.toBeInTheDocument();
    for (const endpoint of [
      "activity",
      "words",
      "step-times",
      "ai-usage",
      "costs",
      "cost-estimate",
      "budgets",
      "rate-cards",
    ])
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

  it("shows AI usage by area then model, with billing's charge, and narrows to a row", async () => {
    mocks.search = "tab=ai&ai2=model";
    renderPage();
    // The card and the table's total.
    expect(await screen.findAllByText("$41.25")).toHaveLength(2);
    // The filter bar's fields, then the table's two groupings.
    expect(filterLabels()).toEqual([
      "Dates",
      "Project",
      "Task",
      "Area",
      "Channel",
      "Key",
      "Group by",
      "Then by",
    ]);
    expect(callsTo("ai-usage")[0]?.args.query).toMatchObject({
      groupBy: "area",
      thenBy: "model",
      rankBy: "tokens",
      page: "1",
    });
    expect(
      screen.getByText(
        "3 runs, images or videos have no AI credit recorded by billing, so AI credit used leaves them out.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "260 runs, images or videos used your own provider key, which uses no plan credit.",
      ),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Breakdown" });
    // Calls on the workspace's own key cost no plan credit; a gap in billing is never $0.
    expect(within(table).getAllByText("Own key")).toHaveLength(2);
    expect(within(table).getAllByText("3 not recorded").length).toBeGreaterThan(0);

    // A group narrows the tab to it and shows its second-level groups next.
    await userEvent.click(within(table).getByRole("button", { name: "Show only Translation" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&ai=model&area=translation",
        { scroll: false },
      ),
    );
    await userEvent.click(
      within(table).getByRole("button", {
        name: "Show only openai/gpt-6-luna under Translation",
      }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&ai=model&area=translation&model=openai%2Fgpt-6-luna",
        { scroll: false },
      ),
    );
  });

  it("narrows only where a filter can stand for the row, and keeps the chosen task", async () => {
    mocks.search = "tab=ai&task=job_release&ai=project&ai2=model";
    const totals = {
      calls: 4,
      inputTokens: 400,
      outputTokens: 40,
      cacheAndReasoningTokens: 0,
      images: 0,
      videos: 0,
      chargeUsd: "0.00400000",
      unrecordedCharges: 0,
      ownKeyCalls: 0,
    };
    mocks.bodies = {
      ...reportsResponseBodies(),
      "ai-usage": {
        aiUsage: {
          ...reportsAiUsage,
          groupBy: "project",
          thenBy: "model",
          rows: [
            {
              key: "project_web",
              label: "Web app",
              ...totals,
              children: [
                { key: "openai/gpt-6-luna", label: null, ...totals },
                { key: null, label: null, other: true, ...totals },
              ],
            },
            {
              key: null,
              label: null,
              ...totals,
              children: [{ key: "openai/gpt-6-luna", label: null, ...totals }],
            },
          ],
        },
      },
    };
    const { unmount } = renderPage();
    const table = await screen.findByRole("table", { name: "Breakdown" });
    // A fraction of a cent is not shown as $0.00.
    expect(within(table).getAllByText("Under $0.01").length).toBeGreaterThan(0);
    // No filter stands for calls outside any project, nor for "Other", nor for rows under them.
    expect(
      within(table)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Web app", "openai/gpt-6-luna"]);
    await userEvent.click(
      within(table).getByRole("button", { name: "Show only openai/gpt-6-luna under Web app" }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&project=project_web&task=job_release&ai=model&model=openai%2Fgpt-6-luna",
        { scroll: false },
      ),
    );
    unmount();

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show only Web app" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&project=project_web&task=job_release&ai=model",
        { scroll: false },
      ),
    );
    // With a project chosen, project rows narrow no further.
    expect(screen.queryByRole("button", { name: "Show only Web app" })).toBeNull();
  });

  it("compares AI credit only where billing recorded it, and narrows with the filter bar", async () => {
    mocks.search = "tab=ai";
    mocks.bodies = {
      ...reportsResponseBodies(),
      "ai-usage": {
        aiUsage: {
          ...reportsAiUsage,
          // The period before: every run on our AI with no credit recorded.
          previous: {
            ...reportsAiUsage.previous,
            chargeUsd: "0.00000000",
            unrecordedCharges: 2_120,
          },
        },
      },
    };
    renderPage();
    const card = (await screen.findByText("AI credit used")).parentElement!;
    expect(within(card).getByText("No change to show")).toBeInTheDocument();
    expect(within(card).queryByText(/vs previous/)).toBeNull();

    await userEvent.click(screen.getByRole("combobox", { name: "Key" }));
    await userEvent.click(await screen.findByRole("option", { name: "Your own key" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith("/en/org/acme/reports?tab=ai&key=own_key", {
        scroll: false,
      }),
    );
  });

  it("keeps a row whose filter is already set as text, and narrows the rows under it", async () => {
    mocks.search = "tab=ai&ai2=model&area=translation";
    renderPage();
    const table = await screen.findByRole("table", { name: "Breakdown" });
    expect(within(table).queryByRole("button", { name: "Show only Translation" })).toBeNull();
    await userEvent.click(
      within(table).getByRole("button", {
        name: "Show only openai/gpt-6-luna under Translation",
      }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&ai=model&area=translation&model=openai%2Fgpt-6-luna",
        { scroll: false },
      ),
    );
  });

  it("narrows within a project's own Reports page", async () => {
    mocks.search = "tab=ai&ai=project&ai2=model";
    mocks.bodies = {
      ...reportsResponseBodies(),
      "ai-usage": {
        aiUsage: {
          ...reportsAiUsage,
          groupBy: "project",
          thenBy: "model",
          rows: [
            {
              ...reportsAiUsage.rows[0]!,
              key: "project_web",
              label: "Web app",
            },
          ],
        },
      },
    };
    renderPage("project_web");
    const table = await screen.findByRole("table", { name: "Breakdown" });
    expect(callsTo("ai-usage")[0]?.args.query).toMatchObject({ projectId: "project_web" });
    // The project is fixed, so its row is not a filter, but the rows under it are.
    expect(within(table).queryByRole("button", { name: "Show only Web app" })).toBeNull();
    await userEvent.click(
      within(table).getByRole("button", { name: "Show only openai/gpt-6-luna under Web app" }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&ai=model&model=openai%2Fgpt-6-luna",
        { scroll: false },
      ),
    );
  });

  it("lists the details chosen from a row, each removable", async () => {
    mocks.search = "tab=ai&model=openai/gpt-6-luna&automation=auto_1";
    mocks.bodies = {
      ...reportsResponseBodies(),
      "ai-usage": { aiUsage: { ...reportsAiUsage, automationName: "Nightly" } },
    };
    renderPage();
    expect(await screen.findByText("Model: openai/gpt-6-luna")).toBeInTheDocument();
    // The automation's name comes with the usage.
    expect(await screen.findByText("Automation: Nightly")).toBeInTheDocument();
    expect(callsTo("ai-usage")[0]?.args.query).toMatchObject({
      model: "openai/gpt-6-luna",
      automationId: "auto_1",
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Model" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenLastCalledWith(
        "/en/org/acme/reports?tab=ai&automation=auto_1",
        { scroll: false },
      ),
    );
  });

  it("estimates a project's own page whole when no task is chosen", async () => {
    mocks.search = "tab=estimate";
    renderPage("project_web");
    expect(
      await screen.findByText(/The whole project: every string it holds now/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(callsTo("cost-estimate")[0]?.args.query).toMatchObject({ projectId: "project_web" }),
    );
    expect(callsTo("cost-estimate")[0]?.args.query?.jobIds ?? "").toBe("");
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
    const row = (language: string) =>
      rows.find((candidate) => candidate.textContent?.includes(language))?.textContent;
    expect(row("fr-FR")).toContain("No rate");
    expect(row("de-DE")).toContain("$0.12 / word");
    // Each row says which card applies to it and why, and the note names the card without a rate.
    expect(row("de-DE")).toContain("Standard 2026 · budget");
    expect(row("fr-FR")).toContain("Standard 2026 · chosen here");
    expect(screen.getByText(/fr-FR has no rate on Standard 2026/)).toBeInTheDocument();
  });

  it("names each row's own card, not the one chosen, and leaves fixed fees without one", async () => {
    mocks.search = "tab=estimate&tasks=job_release,job_billing&rateCard=Agency B";
    const [priced, unpriced] = reportsCostEstimate.rows;
    mocks.bodies["cost-estimate"] = {
      costEstimate: {
        ...reportsCostEstimate,
        unit: "words",
        rateCardName: "Agency B",
        rows: [
          { ...priced, pricedBy: ["task"] },
          { ...unpriced, pricedBy: ["chosen"], rateCardName: "Agency B" },
          {
            ...unpriced,
            targetLocale: "ja-JP",
            pricing: "fixed",
            pricedBy: [],
            rateCardName: null,
          },
        ],
      },
    };
    renderPage();
    const table = await screen.findByRole("table", { name: "Cost estimate" });
    const row = (language: string) =>
      within(table)
        .getAllByRole("row")
        .find((candidate) => candidate.textContent?.startsWith(language));
    expect(row("de-DE")?.textContent).toContain("Standard 2026 · task");
    expect(row("fr-FR")?.textContent).toContain("Agency B · chosen here");
    expect(within(row("ja-JP")!).getByText("Fixed fee")).toBeInTheDocument();
    expect(row("ja-JP")?.textContent).not.toContain("Agency B");
    expect(screen.getByText(/fr-FR has no rate on Agency B/)).toBeInTheDocument();
  });

  it("says when rows are priced by more than one card, and when the workspace has no card", async () => {
    mocks.search = "tab=estimate&tasks=job_release";
    const [priced] = reportsCostEstimate.rows;
    const estimate = (rows: typeof reportsCostEstimate.rows, incomplete: boolean) => ({
      costEstimate: {
        ...reportsCostEstimate,
        unit: "words",
        rows,
        totals: { ...reportsCostEstimate.totals, incomplete },
      },
    });
    mocks.bodies["cost-estimate"] = estimate(
      [
        { ...priced, pricedBy: ["budget"] },
        {
          ...priced,
          targetLocale: "ja-JP",
          rateId: "rate_ja",
          pricedBy: ["task"],
          rateCardName: "Agency B",
        },
      ],
      false,
    );
    const { unmount } = renderPage();
    expect(await screen.findByText("2 rate cards · translation and review")).toBeInTheDocument();
    unmount();

    mocks.bodies = reportsResponseBodies(createReportsSettings({ rateCardNames: [] }));
    mocks.bodies["cost-estimate"] = estimate(
      [{ ...reportsCostEstimate.rows[1], pricedBy: [], rateCardName: null }],
      true,
    );
    renderPage();
    const table = await screen.findByRole("table", { name: "Cost estimate" });
    expect(within(table).getByText("No rate card")).toBeInTheDocument();
    expect(
      screen.getByText(/fr-FR has no rate card, because the workspace has none yet/),
    ).toBeInTheDocument();
  });

  it("splits AI into on tasks and outside tasks, with AI outside any project as its own row", async () => {
    mocks.search = "tab=costs";
    renderPage();
    const table = await screen.findByRole("table", { name: "Costs by project" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Project", "People", "AI on tasks", "AI outside tasks", "Expenses", "Total"]);
    const cells = (name: string) =>
      within(table)
        .getAllByRole("row")
        .find((row) => row.textContent?.startsWith(name))
        ?.querySelectorAll("td");
    expect(Array.from(cells("Outside any project") ?? [], (cell) => cell.textContent)).toEqual([
      "Outside any project",
      "—",
      "$0.00",
      "$18.20",
      "—",
      "$18.20",
    ]);
    expect(Array.from(cells("Total") ?? [], (cell) => cell.textContent)).toEqual([
      "Total",
      "$3,410.00",
      "$540.40",
      "$90.20",
      "$0.00",
      "$4,040.60",
    ]);
    expect(screen.getByText("Charged AI calls, on tasks and outside them")).toBeInTheDocument();
  });

  it("leaves out an empty outside-any-project row, and shows nothing spent only when nothing was", async () => {
    mocks.search = "tab=costs";
    const zero = {
      aiUsd: "0.00000000",
      aiOnTasksUsd: "0.00000000",
      aiOutsideTasksUsd: "0.00000000",
    };
    mocks.bodies.costs = { costs: { ...reportsCosts, outsideProjects: zero } };
    const { unmount } = renderPage();
    const table = await screen.findByRole("table", { name: "Costs by project" });
    expect(within(table).queryByText("Outside any project")).not.toBeInTheDocument();
    unmount();

    mocks.bodies.costs = { costs: { ...reportsCosts, rows: [], outsideProjects: zero } };
    const { unmount: unmountEmpty } = renderPage();
    expect(await screen.findByText("Nothing was spent in these dates.")).toBeInTheDocument();
    unmountEmpty();

    // Only AI outside any project: still a table, not "nothing spent".
    mocks.bodies.costs = { costs: { ...reportsCosts, rows: [] } };
    renderPage();
    const outsideOnly = await screen.findByRole("table", { name: "Costs by project" });
    expect(within(outsideOnly).getByText("Outside any project")).toBeInTheDocument();
  });

  it("leaves AI out while a language is chosen, and says so", async () => {
    mocks.search = "tab=costs&language=de-DE";
    const [project] = reportsCosts.rows;
    mocks.bodies.costs = {
      costs: {
        ...reportsCosts,
        rows: [{ ...project, aiUsd: null, aiOnTasksUsd: null, aiOutsideTasksUsd: null }],
        outsideProjects: null,
        totals: {
          ...reportsCosts.totals,
          aiUsd: null,
          aiOnTasksUsd: null,
          aiOutsideTasksUsd: null,
        },
      },
    };
    renderPage();
    const table = await screen.findByRole("table", { name: "Costs by project" });
    const cells = within(table)
      .getAllByRole("row")
      .find((row) => row.textContent?.startsWith("Web app"))
      ?.querySelectorAll("td");
    expect(Array.from(cells ?? [], (cell) => cell.textContent).slice(2, 4)).toEqual(["—", "—"]);
    expect(within(table).queryByText("Outside any project")).not.toBeInTheDocument();
    expect(screen.getByText(/AI charges are not split by language/)).toBeInTheDocument();
  });
});
