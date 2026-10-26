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

import {
  createReportsSettings,
  reportsResponseBodies,
  type ReportsApiCall,
} from "./reports.fixture";
import { SetBudgetDialog } from "./set-budget-dialog";

const mocks = vi.hoisted(() => ({
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
}));

vi.mock("@/lib/api-client-instance", async () => ({
  apiClient: (await import("./reports.fixture")).reportsApiClient(mocks),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDialog(projectId: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <SetBudgetDialog
          organizationSlug="acme"
          settings={createReportsSettings()}
          projectId={projectId}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.bodies = reportsResponseBodies();
});

describe("Set a budget dialog", () => {
  it("fills in the chosen project's budget, whatever the page is filtered to", async () => {
    renderDialog("project_help");
    await waitFor(() => expect(screen.getByLabelText("Budget (USD)")).toHaveValue("5000"));
    expect(screen.getByRole("combobox", { name: "Rate card" })).toHaveTextContent("No rate card");
    // Every project's budget is read, not only the filtered one's.
    expect(mocks.calls.find((call) => call.endpoint === "budgets")?.args.query).toEqual({});

    await choose("Project", "Web app");
    expect(screen.getByLabelText("Budget (USD)")).toHaveValue("20000");
    expect(screen.getByRole("combobox", { name: "Rate card" })).toHaveTextContent("Standard 2026");
  });

  it("saves the amount and keeps the project's rate card", async () => {
    renderDialog("project_web");
    await waitFor(() => expect(screen.getByLabelText("Budget (USD)")).toHaveValue("20000"));
    await userEvent.clear(screen.getByLabelText("Budget (USD)"));
    await userEvent.type(screen.getByLabelText("Budget (USD)"), "25000");
    await userEvent.click(screen.getByRole("button", { name: "Save budget" }));
    await waitFor(() =>
      expect(mocks.calls.find((call) => call.method === "put")?.args.json).toEqual({
        projectId: "project_web",
        budget: "25000",
        rateCardName: "Standard 2026",
      }),
    );
  });
});
