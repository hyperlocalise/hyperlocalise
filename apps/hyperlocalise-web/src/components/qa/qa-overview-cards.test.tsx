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

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { QaOverviewTray, QaTrendChartCard } from "./qa-overview-cards";

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("next/image", () => ({ default: () => null }));

describe("QaOverviewTray", () => {
  it("keeps charts collapsed until asked and shows them on toggle", async () => {
    const user = userEvent.setup();
    render(
      <IntlProvider locale="en" messages={{}}>
        <QaOverviewTray
          needsAction={false}
          hint="Select a bar to filter the findings below."
          metrics={<p>Metric</p>}
          charts={<p>Chart</p>}
        />
      </IntlProvider>,
    );

    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.queryByText("Chart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show charts" }));
    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Select a bar to filter the findings below.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide charts" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("QaTrendChartCard", () => {
  it("explains the trend needs at least two scans", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <QaTrendChartCard
          rows={[{ id: "run_latest", label: "Oct 1", errors: 2, warnings: 3 }]}
          selectedId="run_latest"
          onSelect={vi.fn()}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("region", { name: "Errors and warnings over time" })).toHaveTextContent(
      "Run more scans to see a trend.",
    );
  });
});
