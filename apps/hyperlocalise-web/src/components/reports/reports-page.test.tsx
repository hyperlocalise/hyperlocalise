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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ReportsPage } from "./reports-page";
import {
  createReportsSettings,
  createReportsWordCounts,
  createReportsWordSeries,
  reportsAiUsage,
  reportsBandSeries,
  reportsCostEstimate,
  reportsCosts,
  reportsResponseBodies,
  reportsWordCountSeries,
  type ReportsApiCall,
} from "./reports.fixture";
import type { WordCountSeries } from "@/lib/reporting/word-queries";

const mocks = vi.hoisted(() => ({
  search: "",
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
}));

const PATHNAME = "/en/org/acme/reports";

/**
 * The address as Next keeps it: the router's navigations land a moment later, as they do in
 * the app, while the browser's own `history.replaceState` changes it at once; both re-render
 * what reads `useSearchParams`.
 */
const address = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let search = "";
  const set = (href: string) => {
    search = new URL(href, "http://localhost").search.replace(/^\?/, "");
    for (const listener of listeners) listener();
  };
  return {
    get: () => search,
    set,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({
      replace: (href: string) => setTimeout(() => address.set(href), 30),
    }),
    usePathname: () => PATHNAME,
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(address.subscribe, address.get, address.get)),
  };
});

const replaceState = window.history.replaceState.bind(window.history);
window.history.replaceState = (data, unused, url) => {
  replaceState(data, unused, url);
  if (url) address.set(String(url));
};

/** The address the page ends up on. */
function currentHref() {
  const search = address.get();
  return search ? `${PATHNAME}?${search}` : PATHNAME;
}

vi.mock("@/components/ui/chart", () => ({
  // The chart's summary sentence is kept, as assistive technology reads it.
  ChartContainer: ({
    children,
    role,
    "aria-label": label,
  }: {
    children: ReactNode;
    role?: string;
    "aria-label"?: string;
  }) => (
    <div role={role} aria-label={label}>
      {children}
    </div>
  ),
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
  replaceState(null, "", mocks.search ? `${PATHNAME}?${mocks.search}` : PATHNAME);
  address.set(mocks.search ? `${PATHNAME}?${mocks.search}` : PATHNAME);
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
    // Time on each step: logged time by what each task is for, then task runs and their
    // stages (the count on the runs' own row only), then workflow steps.
    const stepTimes = screen.getByRole("table", { name: "Time on each step" });
    const rows = within(stepTimes)
      .getAllByRole("row")
      .slice(1)
      .map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent));
    expect(rows.slice(0, 9)).toEqual([
      ["Translate (logged)", "41 h 30 m", "5 people"],
      ["Post-edit (logged)", "15 h 00 m", "2 people"],
      ["Proofread (logged)", "8 h 00 m", "3 people"],
      ["Translation task runs", "6 h 12 m", "212 runs"],
      ["Task runs: Preparing", "0 h 30 m", ""],
      ["Task runs: Reusing memory", "0 h 05 m", ""],
      ["Task runs: Translating", "5 h 00 m", ""],
      ["Task runs: Finishing", "0 h 25 m", ""],
      ["Task runs: Other", "0 h 12 m", ""],
    ]);
    expect(rows[9]?.[0]).toMatch(/^Workflow: /);
  });

  it("shows each task's step beside the step its time is costed as", async () => {
    mocks.search = "tab=time";
    renderPage();
    const table = await screen.findByRole("table", { name: "Time logged by task" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Task", "Task step", "Costed as", "Language", "Time logged", "People"]);
    const cells = Array.from(
      within(table).getAllByRole("row")[1]!.querySelectorAll("td"),
      (cell) => cell.textContent,
    );
    expect(cells.slice(0, 3)).toEqual(["Release 4.2 strings", "Translate", "Translation"]);
  });

  it("ends on the last tab chosen when tabs are switched faster than the address updates", async () => {
    renderPage();
    await screen.findByText("48,210");
    // Time, then straight back to Activity before the first change has reached the address.
    await userEvent.click(screen.getByRole("tab", { name: "Time" }));
    await userEvent.click(screen.getByRole("tab", { name: "Activity" }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    expect(currentHref()).toBe(PATHNAME);
  });

  it("picks dates from one button: a ready-made range, two days on the calendar, or typed", async () => {
    renderPage();
    const dates = await screen.findByRole("button", {
      name: /^Dates Last 28 days · Sep 24\s–\sOct 21, 2026$/,
    });
    await userEvent.click(dates);
    await userEvent.click(await screen.findByRole("button", { name: "This month" }));
    await waitFor(() => expect(currentHref()).toBe(`${PATHNAME}?range=month`));
    expect(
      screen.getByRole("button", { name: /^Dates This month · Oct 1\s–\s21, 2026$/ }),
    ).toBeInTheDocument();

    // The first day, then the last, on the calendar.
    await userEvent.click(screen.getByRole("button", { name: /^Dates This month/ }));
    const october = screen.getAllByRole("grid")[1]!;
    // Each day is named in full for screen readers, in the page's language.
    // (inside this month, so already in the chosen range).
    await userEvent.click(
      within(october).getByRole("button", { name: "Monday, October 5, 2026, selected" }),
    );
    expect(screen.getByText("Now choose the last day.")).toBeInTheDocument();
    await userEvent.click(within(october).getByText("12"));
    await waitFor(() =>
      expect(currentHref()).toBe(`${PATHNAME}?range=custom&from=2026-10-05&to=2026-10-12`),
    );
    // Days after today cannot be chosen.
    await userEvent.click(screen.getByRole("button", { name: /^Dates Oct 5\s–\s12, 2026$/ }));
    expect(
      within(screen.getAllByRole("grid")[1]!).getByText("22").closest("button"),
    ).toBeDisabled();

    // A typed day keeps the other end.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    // Applied when the field is left, not on each change made while typing.
    expect(currentHref()).toBe(`${PATHNAME}?range=custom&from=2026-10-05&to=2026-10-12`);
    fireEvent.blur(screen.getByLabelText("From"));
    await waitFor(() =>
      expect(currentHref()).toBe(`${PATHNAME}?range=custom&from=2026-10-01&to=2026-10-12`),
    );
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
      expect(currentHref()).toBe("/en/org/acme/reports?tab=words&range=7&unit=strings&group=task"),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Time" }));
    await waitFor(() =>
      expect(currentHref()).toBe("/en/org/acme/reports?tab=time&range=7&unit=strings&group=task"),
    );
  });

  it("charts volume over time for every grouping, split and per bar as chosen", async () => {
    mocks.search = "tab=words&per=week";
    renderPage();
    // The chart itself is mocked away; its section, legend and subtitle are the page's.
    const section = await screen.findByRole("region", { name: "Volume over time" });
    expect(
      (await within(section).findAllByText(/^(Help centre|Web app|Other)$/)).map(
        (name) => name.textContent,
      ),
    ).toEqual(["Help centre", "Web app"]);
    // Two projects, so nothing is folded into Other; the first week starts on 21 September,
    // before the period's 24th.
    expect(section).toHaveTextContent(
      "Words that arrived. Weeks start on Monday, UTC. A bar at either end counts only the days within these dates.",
    );
    expect(within(section).getByRole("img")).toHaveAccessibleName(
      "Words from Sep 24 to Oct 21, 58,290 in all: Help centre: 39,870 and Web app: 18,420",
    );
    const pressed = (name: string) =>
      within(section).getByRole("button", { name }).getAttribute("aria-pressed");
    expect([pressed("Project"), pressed("Week")]).toEqual(["true", "true"]);
    expect(callsTo("word-series")[0].args.query).toMatchObject({
      split: "project",
      mode: "arrived",
      per: "week",
    });

    // Split by match band: the tiers' own names, and the table is not read again.
    mocks.bodies = {
      ...mocks.bodies,
      "word-series": { wordSeries: createReportsWordSeries(reportsBandSeries) },
    };
    await userEvent.click(within(section).getByRole("button", { name: "Match band" }));
    await waitFor(() => expect(section).toHaveTextContent("100% and repetitions"));
    expect(section).toHaveTextContent("75–94%");
    expect(section).toHaveTextContent("New and not matched");
    expect(section).not.toHaveTextContent("The five largest");
    expect(callsTo("word-series").at(-1)?.args.query).toMatchObject({ split: "band" });
    expect(callsTo("words")).toHaveLength(1);

    await userEvent.click(within(section).getByRole("button", { name: "Month" }));
    expect(pressed("Month")).toBe("true");
    await waitFor(() =>
      expect(callsTo("word-series").at(-1)?.args.query).toMatchObject({
        split: "band",
        per: "month",
      }),
    );
    expect(currentHref()).toBe("/en/org/acme/reports?tab=words&split=band&per=month");
    expect(callsTo("words")).toHaveLength(1);
  });

  it("lets the dates choose the chart's bar length unless one is chosen for them", async () => {
    mocks.search = "tab=words&range=90";
    renderPage();
    const section = await screen.findByRole("region", { name: "Volume over time" });
    // Over 45 days, weeks, as the server works it out; nothing is sent for it.
    expect(within(section).getByRole("button", { name: "Week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(callsTo("word-series")).toHaveLength(1));
    expect(callsTo("word-series")[0].args.query).not.toHaveProperty("per");

    await userEvent.click(within(section).getByRole("button", { name: "Day" }));
    await waitFor(() => expect(currentHref()).toBe(`${PATHNAME}?tab=words&range=90&per=day`));
    // New dates go back to their own bar length.
    await userEvent.click(screen.getByRole("button", { name: /^Dates Last 90 days/ }));
    await userEvent.click(await screen.findByRole("button", { name: "This month" }));
    await waitFor(() => expect(currentHref()).toBe(`${PATHNAME}?tab=words&range=month`));
    expect(within(section).getByRole("button", { name: "Day" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says what the chart folds, counts per task and cuts short, as its data has it", async () => {
    const series = (fields: Partial<WordCountSeries>) => ({
      "word-series": {
        wordSeries: createReportsWordSeries({ ...reportsWordCountSeries, ...fields }),
      },
    });
    const subtitle = async () =>
      (await screen.findByRole("region", { name: "Volume over time" })).querySelector("p")
        ?.textContent;
    // Five languages and Other; weeks from the period's first Monday, the last one cut short.
    mocks.search = "tab=words&split=language&per=week";
    mocks.bodies = {
      ...reportsResponseBodies(),
      ...series({
        split: "language",
        groups: [
          ...["da-DK", "de-DE", "fr-FR", "it-IT", "ja-JP"].map((key) => ({
            key,
            name: null,
            other: false,
          })),
          { key: null, name: null, other: true },
        ],
        points: [
          { start: "2026-09-28", units: [6, 5, 4, 3, 2, 1] },
          { start: "2026-10-19", units: [6, 5, 4, 3, 2, 1] },
        ],
      }),
    };
    const first = renderPage();
    await waitFor(async () =>
      expect(await subtitle()).toBe(
        "Words that arrived. The five largest languages on their own, the rest as Other. Weeks start on Monday, UTC. A bar at either end counts only the days within these dates.",
      ),
    );
    first.unmount();

    // Task steps: each named, and a string in several tasks counted in each, for arrived work.
    const steps = series({
      split: "task_step",
      per: "day",
      groups: ["translate", "post_edit", "no_task"].map((key) => ({
        key,
        name: null,
        other: false,
      })),
      points: [{ start: "2026-10-01", units: [3, 2, 1] }],
    });
    mocks.search = "tab=words&split=task_step";
    mocks.bodies = { ...reportsResponseBodies(), ...steps };
    const second = renderPage();
    const section = await screen.findByRole("region", { name: "Volume over time" });
    for (const name of ["Translate", "Post-edit", "No task (content editor)"])
      expect(await within(section).findByText(name)).toBeInTheDocument();
    expect(await subtitle()).toBe(
      "Words that arrived. A string in more than one task counts in each. Days are in UTC.",
    );
    second.unmount();

    // Finished work is one record per finish, so nothing is said of tasks.
    mocks.search = "tab=words&split=task_step&mode=finished";
    mocks.bodies = {
      ...reportsResponseBodies(),
      "word-series": {
        wordSeries: { ...steps["word-series"].wordSeries, mode: "finished" as const },
      },
    };
    renderPage();
    await waitFor(async () => expect(await subtitle()).toBe("Words finished. Days are in UTC."));
  });

  it("hides the chart when nothing happened in the period", async () => {
    mocks.search = "tab=words";
    mocks.bodies = {
      ...reportsResponseBodies(),
      "word-series": {
        wordSeries: createReportsWordSeries({ ...reportsWordCountSeries, groups: [], points: [] }),
      },
    };
    renderPage();
    await screen.findByRole("table", { name: "Word counts" });
    expect(screen.queryByRole("region", { name: "Volume over time" })).toBeNull();
  });

  it("lists each match band's share of the table", async () => {
    mocks.search = "tab=words";
    renderPage();
    const bands = await screen.findByRole("region", { name: "Match bands" });
    // Read out as one sentence each; the visible name, bar and figures are hidden from it.
    for (const text of ["Repetition: 2,000, 3%", "100%: 4,000, 7%", "New: 52,290, 90%"])
      expect(within(bands).getByText(text)).toHaveClass("sr-only");
    expect(within(bands).getAllByRole("listitem")).toHaveLength(3);
  });

  it("groups word counts by language and by task step", async () => {
    mocks.search = "tab=words&group=language";
    mocks.bodies = {
      ...reportsResponseBodies(),
      words: {
        wordCounts: {
          unit: "words",
          step: "translation",
          mode: "arrived",
          groupBy: "language",
          ...createReportsWordCounts({
            rows: createReportsWordCounts().rows.map((row) => ({
              ...row,
              projectId: null,
              projectName: null,
            })),
          }),
        },
      },
    };
    renderPage();
    const table = await screen.findByRole("table", { name: "Word counts" });
    expect(callsTo("words")[0].args.query).toMatchObject({ groupBy: "language" });
    expect(within(table).queryByRole("columnheader", { name: "Project" })).toBeNull();
    expect(within(table).getByRole("columnheader", { name: "Language" })).toBeInTheDocument();

    mocks.bodies = {
      ...mocks.bodies,
      words: {
        wordCounts: {
          unit: "words",
          step: "translation",
          mode: "arrived",
          groupBy: "task_step",
          ...createReportsWordCounts({
            rows: createReportsWordCounts().rows.map((row, index) => ({
              ...row,
              projectId: null,
              projectName: null,
              taskStep: index === 0 ? "translate" : "no_task",
            })),
          }),
        },
      },
    };
    await userEvent.click(screen.getByRole("button", { name: "By task step" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "Word counts" })).getByRole("columnheader", {
          name: "Task step",
        }),
      ).toBeInTheDocument(),
    );
    const byStep = screen.getByRole("table", { name: "Word counts" });
    expect(byStep).toHaveTextContent("Translate");
    expect(byStep).toHaveTextContent("No task (content editor)");
    expect(callsTo("words").at(-1)?.args.query).toMatchObject({ groupBy: "task_step" });
    // Rows count a string in each of its tasks; the total counts it once.
    expect(
      screen.getByText(/A string held by more than one task counts in each task's row/),
    ).toBeInTheDocument();
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
      expect(currentHref()).toBe("/en/org/acme/reports?tab=ai&ai=model&area=translation"),
    );
    await userEvent.click(
      within(table).getByRole("button", {
        name: "Show only openai/gpt-6-luna under Translation",
      }),
    );
    await waitFor(() =>
      expect(currentHref()).toBe(
        "/en/org/acme/reports?tab=ai&ai=model&area=translation&model=openai%2Fgpt-6-luna",
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
      expect(currentHref()).toBe(
        "/en/org/acme/reports?tab=ai&project=project_web&task=job_release&ai=model&model=openai%2Fgpt-6-luna",
      ),
    );
    unmount();

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show only Web app" }));
    await waitFor(() =>
      expect(currentHref()).toBe(
        "/en/org/acme/reports?tab=ai&project=project_web&task=job_release&ai=model",
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
    const { unmount } = renderPage();
    const card = (await screen.findByText("AI credit used")).parentElement!;
    expect(within(card).getByText("No change to show")).toBeInTheDocument();
    expect(within(card).queryByText(/vs previous/)).toBeNull();
    unmount();

    // Some credit recorded, but more than 5% of the runs on our AI without: still no base.
    const before = (unrecordedCharges: number) => ({
      ...reportsAiUsage.previous,
      chargeUsd: "30.00000000",
      unrecordedCharges,
    });
    for (const [unrecorded, compared] of [
      [212, false],
      [100, true],
    ] as const) {
      mocks.bodies = {
        ...reportsResponseBodies(),
        "ai-usage": { aiUsage: { ...reportsAiUsage, previous: before(unrecorded) } },
      };
      const view = renderPage();
      const shown = (await screen.findByText("AI credit used")).parentElement!;
      expect(Boolean(within(shown).queryByText(/vs previous/)), String(unrecorded)).toBe(compared);
      view.unmount();
    }
    renderPage();

    await userEvent.click(await screen.findByRole("combobox", { name: "Key" }));
    await userEvent.click(await screen.findByRole("option", { name: "Your own key" }));
    await waitFor(() => expect(currentHref()).toBe("/en/org/acme/reports?tab=ai&key=own_key"));
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
      expect(currentHref()).toBe(
        "/en/org/acme/reports?tab=ai&ai=model&area=translation&model=openai%2Fgpt-6-luna",
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
      expect(currentHref()).toBe("/en/org/acme/reports?tab=ai&ai=model&model=openai%2Fgpt-6-luna"),
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
      expect(currentHref()).toBe("/en/org/acme/reports?tab=ai&automation=auto_1"),
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
    ).toEqual(["Project", "People", "AI on tasks", "AI outside tasks", "Total"]);
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
      "$18.20",
    ]);
    expect(Array.from(cells("Total") ?? [], (cell) => cell.textContent)).toEqual([
      "Total",
      "$3,410.00",
      "$540.40",
      "$90.20",
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
