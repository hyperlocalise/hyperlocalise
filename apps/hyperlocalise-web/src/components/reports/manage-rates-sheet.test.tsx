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

import { ManageRatesSheet } from "./manage-rates-sheet";
import {
  createReportsSettings,
  reportsResponseBodies,
  reportsRateCards,
  type ReportsApiCall,
} from "./reports.fixture";

const mocks = vi.hoisted(() => ({
  calls: [] as ReportsApiCall[],
  bodies: {} as Record<string, unknown>,
  statuses: {} as Record<string, number>,
}));

vi.mock("@/lib/go-svc/use-go-svc-client", async () => ({
  useGoSvcClient: (await import("./reports.fixture")).reportsGoSvcClient(mocks),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSheet(canManage: boolean, onCardChange = vi.fn()) {
  mocks.bodies = {
    ...reportsResponseBodies(createReportsSettings({ canManage })),
    "rate-cards": { rateCards: reportsRateCards, canManage },
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <ManageRatesSheet
          organizationSlug="acme"
          settings={createReportsSettings({ canManage })}
          cardName="Standard 2026"
          onCardChange={onCardChange}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
  return onCardChange;
}

const saved = () =>
  mocks.calls.filter((call) => call.endpoint === "rate-cards" && call.method === "put");

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.statuses = {};
});

describe("Rates panel", () => {
  it("shows rates read-only to roles that cannot change them", async () => {
    renderSheet(false);
    expect(screen.getByText("Only admins can change rates.")).toBeInTheDocument();
    expect(await screen.findByText("$0.12")).toBeInTheDocument();
    expect(screen.getByText("Per hour")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves a changed rate with the card's band shares on every line", async () => {
    renderSheet(true);
    await screen.findAllByRole("textbox", { name: "Rate (USD)" });
    // The hourly line pays no band shares, so the card's lines do not differ.
    expect(screen.queryByText(/pay different shares by match band/)).toBeNull();
    const [wordRate] = screen.getAllByRole("textbox", { name: "Rate (USD)" });
    await userEvent.clear(wordRate);
    await userEvent.type(wordRate, "0.15");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saved()).toHaveLength(1));
    const body = saved()[0].args.json as {
      name: string;
      create: boolean;
      lines: { targetLocale: string; rate: string; basis: string; percentages: object }[];
    };
    expect(body).toMatchObject({ name: "Standard 2026", create: false, defaultBasis: "word" });
    expect(body.lines.map((line) => [line.targetLocale, line.basis, line.rate])).toEqual([
      ["de-DE", "word", "0.15"],
      ["de-DE", "hour", "45"],
    ]);
    expect(body.lines[1].percentages).toEqual({ "100": 30, repetition: 20 });
  });

  it("saves the lines shown as a new rate card", async () => {
    const onCardChange = renderSheet(true);
    await screen.findAllByRole("textbox", { name: "Rate (USD)" });
    await userEvent.click(screen.getByRole("button", { name: "Save as new rate card" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Give the rate card a name.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "Agency C");
    mocks.bodies["put rate-cards"] = { rateCard: { ...reportsRateCards[0], name: "Agency C" } };
    // The list's reload fails: the sheet still shows the card just saved, not another one.
    mocks.statuses["get rate-cards"] = 503;
    mocks.bodies["get rate-cards"] = { error: "reports_busy", message: "Reports is busy" };
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0].args.json).toMatchObject({ name: "Agency C", create: true });
    expect((saved()[0].args.json as { lines: unknown[] }).lines).toHaveLength(2);
    await waitFor(() => expect(onCardChange).toHaveBeenCalledWith("Agency C"));
    expect(screen.getByRole("combobox", { name: "Rate card" })).toHaveTextContent("Agency C");
  });
});
