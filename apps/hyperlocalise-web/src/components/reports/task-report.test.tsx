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

import {
  createReportsSettings,
  reportsResponseBodies,
  type ReportsApiCall,
} from "./reports.fixture";
import { TaskReport } from "./task-report";

const mocks = vi.hoisted(() => ({
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
  statuses: {} as Record<string, number>,
}));

vi.mock("@/lib/api-client-instance", async () => ({
  apiClient: (await import("./reports.fixture")).reportsApiClient(mocks),
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
  it("shows the task's words, cost and match analysis, priced last by the workspace's first card", async () => {
    renderReport();
    const table = await screen.findByRole("table", { name: "Task match analysis" });
    expect(callsTo("task-report")[0].args).toMatchObject({
      param: { organizationSlug: "acme", jobId: "job_release" },
      query: { unit: "words", step: "translation", rateCard: "Standard 2026" },
    });
    expect(card("Words to translate")?.textContent).toContain("8,890");
    expect(card("Words to translate")?.textContent).toContain("4,445 unique · 2 languages");
    expect(card("Progress")?.textContent).toContain("85%");
    expect(card("Approved")?.textContent).toContain("26%");
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

  it("shows other roles no money or pricing, only their own time, and links to the task's words", async () => {
    mocks.bodies = reportsResponseBodies(
      createReportsSettings({ financial: false, canManage: false }),
    );
    renderReport();
    const table = await screen.findByRole("table", { name: "Task match analysis" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).not.toContain("Cost");
    expect(screen.queryByText("Estimated cost")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Task pricing by step" })).not.toBeInTheDocument();
    expect(screen.getByText("Only your own entries are listed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Reports" })).toHaveAttribute(
      "href",
      "/org/acme/projects/project_web/reports?tab=words&task=job_release&group=task",
    );
  });
});
