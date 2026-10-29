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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { LogTimeDialog } from "./log-time-dialog";
import {
  createReportsSettings,
  reportsResponseBodies,
  type ReportsApiCall,
} from "./reports.fixture";

const mocks = vi.hoisted(() => ({
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
}));

vi.mock("@/lib/go-svc/use-go-svc-client", async () => ({
  useGoSvcClient: (await import("./reports.fixture")).reportsGoSvcClient(mocks),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDialog(
  onClose = vi.fn(),
  task: { projectId: string | null; languages?: string[]; step?: "translation" | "review" } = {
    projectId: null,
  },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <LogTimeDialog
          organizationSlug="acme"
          settings={createReportsSettings()}
          projectId={task.projectId}
          jobId="job_release"
          languages={task.languages}
          step={task.step}
          onClose={onClose}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
  return onClose;
}

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.bodies = reportsResponseBodies();
});

describe("Log time dialog", () => {
  it("offers the task's project's languages when the task names none and has no Reports data", async () => {
    // The task lookup finds only tasks with Reports strings.
    mocks.bodies.jobs = { jobs: [] };
    renderDialog(vi.fn(), { projectId: "project_web", languages: [] });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).not.toBeDisabled(),
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Language" }));
    expect(await screen.findByRole("option", { name: "de-DE" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ja-JP" })).toBeInTheDocument();
  });

  it("asks for a language and a time within a day before saving", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Log time" }));
    expect(await screen.findByText("Choose a language.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).not.toBeDisabled(),
    );
    await choose("Language", "ja-JP");
    await userEvent.clear(screen.getByLabelText("Hours"));
    await userEvent.type(screen.getByLabelText("Hours"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Log time" }));
    expect(await screen.findByText("Enter between 1 minute and 24 hours.")).toBeInTheDocument();
    expect(mocks.calls.filter((call) => call.endpoint === "time-entries")).toEqual([]);
  });

  it("opens on the task's own step, so time on a proofread task lands on Review", async () => {
    const onClose = renderDialog(vi.fn(), { projectId: null, step: "review" });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).not.toBeDisabled(),
    );
    expect(screen.getByRole("combobox", { name: "Step" })).toHaveTextContent("Review");
    await choose("Language", "ja-JP");
    await userEvent.click(screen.getByRole("button", { name: "Log time" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.calls.find((call) => call.endpoint === "time-entries")?.args.json).toMatchObject({
      step: "review",
    });
  });

  it("logs the time in minutes on the chosen day and closes", async () => {
    const onClose = renderDialog();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Language" })).not.toBeDisabled(),
    );
    await choose("Language", "ja-JP");
    await choose("Step", "Review");
    await userEvent.clear(screen.getByLabelText("Minutes"));
    await userEvent.type(screen.getByLabelText("Minutes"), "30");
    await userEvent.type(screen.getByLabelText("Note"), "Checked UI length limits");
    await userEvent.click(screen.getByRole("button", { name: "Log time" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.calls.find((call) => call.endpoint === "time-entries")?.args.json).toEqual({
      jobId: "job_release",
      step: "review",
      targetLocale: "ja-JP",
      workDate: "2026-10-21",
      minutes: 90,
      note: "Checked UI length limits",
    });
  });
});
