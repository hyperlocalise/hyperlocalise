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
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createReportsSettings,
  reportsResponseBodies,
  reportsTaskReport,
  type ReportsApiCall,
} from "./reports.fixture";
import { TaskReport } from "./task-report";

const mocks = vi.hoisted(() => ({
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
  statuses: {} as Record<string, number>,
}));

vi.mock("@/lib/go-svc/use-go-svc-client", async () => ({
  useGoSvcClient: (await import("./reports.fixture")).reportsGoSvcClient(mocks),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderReport() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <TaskReport organizationSlug="acme" jobId="job_release" />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

const callsTo = (endpoint: string) => mocks.calls.filter((call) => call.endpoint === endpoint);
const card = (label: string) => screen.getByText(label, { selector: "p" }).parentElement;
const rowOf = (table: HTMLElement, start: string) =>
  within(table)
    .getAllByRole("row")
    .find((row) => row.textContent?.startsWith(start));

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.statuses = {};
  mocks.bodies = reportsResponseBodies();
});

describe("Task report", () => {
  it("shows the task's words, cost and match analysis, priced by its own card or its budget's only", async () => {
    renderReport();
    const table = await screen.findByRole("table", { name: "Task match analysis" });
    // No card chosen on the page stands in: a language neither card prices shows "No rate".
    expect(callsTo("task-report")[0].args).toMatchObject({
      param: { organizationSlug: "acme", jobId: "job_release" },
      query: { unit: "words", step: "translation" },
    });
    expect(callsTo("task-report")[0].args.query).not.toHaveProperty("rateCard");
    expect(card("Words to translate")?.textContent).toContain("8,890");
    expect(card("Words to translate")?.textContent).toContain("4,445 unique · 2 languages");
    expect(card("Progress")?.textContent).toContain("85%");
    // A snapshot of the task's own strings sent for review: 2,000 of 4,100.
    expect(card("Approved")?.textContent).toContain("49%");
    expect(card("Estimated cost")?.textContent).toContain("$432.60");
    expect(rowOf(table, "de-DE")?.textContent).toContain("3,605");
    expect(rowOf(table, "de-DE")?.textContent).toContain("$432.60");
    expect(rowOf(table, "ja-JP")?.textContent).toContain("—");
    // The roles that see money go to the task's estimate.
    expect(screen.getByRole("link", { name: "Open in Reports" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_web/reports?tab=estimate&tasks=job_release",
    );

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(callsTo("task-report").at(-1)?.args.query).toMatchObject({ step: "review" }),
    );
    const review = await screen.findByRole("table", { name: "Task match analysis" });
    await waitFor(() => expect(rowOf(review, "ja-JP")).toBeUndefined());
    expect(rowOf(review, "de-DE")?.textContent).toContain("4,100");
    expect(screen.getByText("Words to review")).toBeInTheDocument();
  });

  it("says a new task's strings are being counted, and shows them once they are", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const words = reportsTaskReport.words!;
      mocks.bodies["task-report"] = {
        taskReport: {
          ...reportsTaskReport,
          words: { ...words, rows: words.rows.filter((row) => row.step !== "translation") },
        },
      };
      const state = (status: "pending" | "done") => ({
        analysis: [
          {
            step: "translation",
            status,
            incomplete: false,
            strings: null,
            error: null,
            updatedAt: "",
          },
        ],
      });
      mocks.bodies["task-analysis"] = state("pending");
      renderReport();
      expect(
        await screen.findByText(
          "Reports is still counting this task's strings. They usually show within a minute.",
        ),
      ).toBeInTheDocument();
      // Nothing is added up while counting.
      expect(screen.queryByText("Words to translate")).not.toBeInTheDocument();

      // The tab looks at the state again every few seconds; once the count is done it reads the
      // report again and shows the strings.
      mocks.bodies["task-analysis"] = state("done");
      mocks.bodies["task-report"] = { taskReport: reportsTaskReport };
      await vi.advanceTimersByTimeAsync(5_000);
      const table = await screen.findByRole("table", { name: "Task match analysis" });
      expect(rowOf(table, "de-DE")?.textContent).toContain("3,605");
      expect(callsTo("task-analysis").length).toBeGreaterThan(1);
      expect(callsTo("task-report").length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when the count of a task's strings failed, and when some have no match band", async () => {
    const words = reportsTaskReport.words!;
    mocks.bodies["task-report"] = {
      taskReport: {
        ...reportsTaskReport,
        words: { ...words, rows: words.rows.filter((row) => row.step !== "translation") },
      },
    };
    mocks.bodies["task-analysis"] = {
      analysis: [
        {
          step: "translation",
          status: "failed",
          incomplete: false,
          strings: null,
          error: "memory_unavailable",
          updatedAt: "",
        },
        {
          step: "review",
          status: "done",
          incomplete: true,
          strings: 2,
          error: null,
          updatedAt: "",
        },
      ],
    };
    renderReport();
    expect(
      await screen.findByText(/Reports could not count this task's strings/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText(/Some strings have no match band/)).toBeInTheDocument();
  });

  it("shows a step's fixed fee, which no language's row holds, and says the task ended", async () => {
    const estimate = reportsTaskReport.estimate!;
    mocks.bodies["task-report"] = {
      taskReport: {
        ...reportsTaskReport,
        task: { ...reportsTaskReport.task, status: "succeeded" },
        estimate: {
          ...estimate,
          rows: estimate.rows.map((line) => ({
            ...line,
            pricing: "fixed",
            weighted: null,
            costUsd: null,
          })),
          fixedFees: [
            {
              jobId: "job_release",
              jobTitle: "Release",
              step: "translation",
              amountUsd: "250.00000000",
            },
          ],
          totals: { ...estimate.totals, weighted: null, costUsd: "250.00000000" },
        },
        pricing: reportsTaskReport.pricing!.map((step) => ({ ...step, locked: true })),
      },
    };
    renderReport();
    const table = await screen.findByRole("table", { name: "Task match analysis" });
    expect(rowOf(table, "de-DE")?.textContent).toContain("Fixed fee");
    expect(rowOf(table, "Total")?.textContent).toContain("$250.00");
    expect(
      screen.getByText(
        "This step has a fixed fee of $250.00 for the whole task, counted in the total.",
      ),
    ).toBeInTheDocument();
    const pricing = screen.getByRole("table", { name: "Task pricing by step" });
    expect(within(pricing).getAllByText("Task ended")).toHaveLength(2);
  });

  it("offers a retry when the settings cannot load", async () => {
    mocks.statuses.settings = 500;
    renderReport();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it.each([
    ["could not be reached", 0, undefined],
    ["answered through its load balancer", 502, "<html>Bad gateway</html>"],
    ["hit an internal error", 500, { error: "internal_error", message: "Internal server error" }],
    [
      "could not check the membership",
      503,
      { error: "workos_membership_lookup_failed", message: "WorkOS is unavailable" },
    ],
    [
      "could not look up the flag",
      403,
      { error: "feature_unavailable", message: "Reports is not enabled for this workspace" },
    ],
  ])("asks again soon when go-svc %s", async (_, status, body) => {
    const settings = mocks.bodies.settings;
    mocks.statuses.settings = status;
    mocks.bodies.settings = body;
    renderReport();
    await waitFor(() => expect(callsTo("settings")).toHaveLength(1));
    delete mocks.statuses.settings;
    mocks.bodies.settings = settings;
    expect(
      await screen.findByRole("table", { name: "Task match analysis" }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(callsTo("settings")).toHaveLength(2);
  });

  it.each(["reports_busy", "report_timed_out"])(
    "does not ask go-svc again when it answers %s",
    async (error) => {
      mocks.statuses.settings = 503;
      mocks.bodies.settings = { error, message: "go-svc's own words" };
      renderReport();
      expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(screen.queryByText("go-svc's own words")).not.toBeInTheDocument();
      expect(callsTo("settings")).toHaveLength(1);
    },
  );

  it("does not ask again for another status with no answer from go-svc", async () => {
    mocks.statuses.settings = 500;
    mocks.bodies.settings = "<html>Server error</html>";
    renderReport();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(callsTo("settings")).toHaveLength(1);
  });

  describe("Download CSV", () => {
    const saved: { name: string; href: string }[] = [];
    const revoke = vi.fn();
    beforeEach(() => {
      saved.length = 0;
      vi.mocked(toast.error).mockClear();
      revoke.mockClear();
      vi.stubGlobal(
        "URL",
        class extends URL {
          static createObjectURL = () => "blob:report";
          static revokeObjectURL = revoke;
        },
      );
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        saved.push({ name: this.download, href: this.href });
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("saves the file under go-svc's name", async () => {
      const delay = vi.spyOn(globalThis, "setTimeout");
      renderReport();
      await userEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
      await waitFor(() =>
        expect(saved).toEqual([{ name: "task-report.csv", href: "blob:report" }]),
      );
      expect(callsTo("task-report").at(-1)?.args.query).toMatchObject({ format: "csv" });
      // The file stays for a while after the click, as some browsers need it to.
      const release = delay.mock.calls.find(([, ms]) => ms === 40_000)?.[0] as () => void;
      expect(revoke).not.toHaveBeenCalled();
      release();
      expect(revoke).toHaveBeenCalledWith("blob:report");
    });

    it("says why go-svc refused the download, and nothing technical when it could not answer", async () => {
      renderReport();
      const button = await screen.findByRole("button", { name: "Download CSV" });
      mocks.statuses["task-report"] = 503;
      mocks.bodies["task-report"] = {
        error: "report_timed_out",
        message: "The request took too long; try again, or choose fewer days for a report",
      };
      await userEvent.click(button);
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "The request took too long; try again, or choose fewer days for a report",
        ),
      );
      mocks.statuses["task-report"] = 502;
      mocks.bodies["task-report"] = "<html>Bad gateway</html>";
      await userEvent.click(button);
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
      expect(vi.mocked(toast.error).mock.calls[1][0]).not.toMatch(/go-svc|status/);
      expect(saved).toEqual([]);
    });

    it.each([
      ["reports_unavailable", 503, "Reports service unavailable"],
      ["workos_membership_lookup_failed", 503, "Organization membership could not be verified"],
      ["unauthorized", 401, "token has invalid claims: token is expired"],
    ])("keeps go-svc's own text out of a %s answer", async (error, status, message) => {
      renderReport();
      const button = await screen.findByRole("button", { name: "Download CSV" });
      mocks.statuses["task-report"] = status;
      mocks.bodies["task-report"] = { error, message };
      await userEvent.click(button);
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      expect(vi.mocked(toast.error).mock.calls[0][0]).not.toBe(message);
    });
  });

  it("lets a step's pricing change until its work starts", async () => {
    renderReport();
    const table = await screen.findByRole("table", { name: "Task pricing by step" });
    expect(rowOf(table, "Translation")?.textContent).toContain(
      "Standard 2026 · prices of Oct 14, 2026",
    );
    expect(rowOf(table, "Translation")?.textContent).toContain("Work started");
    expect(rowOf(table, "Review")?.textContent).toContain("4 h 00 m");

    await userEvent.click(screen.getByRole("button", { name: "Set pricing for the Review step" }));
    await choose("Rate card", "Standard 2026");
    await userEvent.type(screen.getByLabelText("Fixed fee (USD)"), "twelve");
    await userEvent.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(
      await screen.findByText("Enter an amount in US dollars, such as 250."),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Fixed fee (USD)"));
    await userEvent.click(screen.getByRole("button", { name: "Save pricing" }));
    await waitFor(() => expect(callsTo("task-rates")).toHaveLength(1));
    expect(callsTo("task-rates")[0].args.json).toEqual({
      jobId: "job_release",
      step: "review",
      rateCardName: "Standard 2026",
      estimatedMinutes: 240,
      overrideUsd: null,
    });
  });

  it("says when work started on a step after the page loaded", async () => {
    mocks.statuses["task-rates"] = 400;
    mocks.bodies["task-rates"] = { error: "task_rate_locked", message: "Locked" };
    renderReport();
    await userEvent.click(
      await screen.findByRole("button", { name: "Set pricing for the Review step" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(
      await screen.findByText(
        "Work on this step has started, so its pricing can no longer change.",
      ),
    ).toBeInTheDocument();
  });

  it("edits and deletes a time entry", async () => {
    renderReport();
    const table = await screen.findByRole("table", { name: "Time logged on this task" });
    expect(rowOf(table, "Oct 20, 2026")?.textContent).toContain("Mina Sato");
    await userEvent.click(screen.getByRole("button", { name: "Edit time logged on Oct 20, 2026" }));
    expect(screen.getByLabelText("Hours")).toHaveValue(2);
    expect(screen.getByLabelText("Minutes")).toHaveValue(30);
    await userEvent.clear(screen.getByLabelText("Minutes"));
    await userEvent.type(screen.getByLabelText("Minutes"), "45");
    await userEvent.clear(screen.getByLabelText("Note"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsTo("time-entry")).toHaveLength(1));
    expect(callsTo("time-entry")[0]).toMatchObject({
      method: "patch",
      args: {
        param: { organizationSlug: "acme", id: "time_mina" },
        json: { workDate: "2026-10-20", minutes: 165, note: "" },
      },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit time logged on Oct 16, 2026" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    await waitFor(() => expect(callsTo("time-entry")).toHaveLength(2));
    expect(callsTo("time-entry")[1]).toMatchObject({
      method: "delete",
      args: { param: { id: "time_lukas" } },
    });
  });

  it("shows other roles only their own time, and links to the task's time", async () => {
    mocks.bodies = reportsResponseBodies(
      createReportsSettings({ financial: false, canManage: false }),
    );
    renderReport();
    expect(
      await screen.findByRole("table", { name: "Time logged on this task" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Task match analysis" })).not.toBeInTheDocument();
    expect(screen.queryByText("Words to translate")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimated cost")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Task pricing by step" })).not.toBeInTheDocument();
    expect(screen.getByText("Only your own entries are listed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Reports" })).toHaveAttribute(
      "href",
      // Dated from the task's start, not the last 28 days.
      "/org/acme/projects/project_web/reports?tab=time&range=custom&from=2026-10-14&to=2026-10-21&task=job_release",
    );
  });
});
