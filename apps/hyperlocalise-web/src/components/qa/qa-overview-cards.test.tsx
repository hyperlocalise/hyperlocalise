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

import { QaTrendChartCard } from "./qa-overview-cards";

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

const rows = [
  { id: "run_older", label: "Sep 24", errors: 1, warnings: 0 },
  { id: "run_latest", label: "Oct 1", errors: 2, warnings: 3 },
];

describe("QaTrendChartCard", () => {
  it("lets keyboard users select a scan", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <IntlProvider locale="en" messages={{}}>
        <QaTrendChartCard rows={rows} selectedId="run_latest" onSelect={onSelect} />
      </IntlProvider>,
    );

    expect(screen.getByRole("group", { name: "Select a scan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oct 1: 2 errors, 3 warnings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Sep 24: 1 errors, 0 warnings" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("run_older");
  });
});
