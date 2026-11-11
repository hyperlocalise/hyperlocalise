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

import { render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { MatchBandTable, visibleBands } from "./match-band-table";

describe("Match band table", () => {
  it("shows the not matched band only when some work has it", () => {
    expect(visibleBands({ new: 3 })).not.toContain("unavailable");
    expect(visibleBands({ new: 3, unavailable: 1 })).toContain("unavailable");
  });

  it("lays out leading columns, one column per band, trailing columns and the totals", () => {
    const rows = [
      { key: "a", name: "Web app", bands: { "100": 4, new: 10 }, total: 14 },
      { key: "b", name: "Help centre", bands: { repetition: 2 }, total: 2 },
    ];
    render(
      <IntlProvider locale="en" messages={{}}>
        <MatchBandTable
          label="Word counts"
          rows={rows}
          rowKey={(row) => row.key}
          bands={visibleBands({ "100": 4, new: 10, repetition: 2 })}
          leading={[{ key: "name", header: "Project", cell: (row) => row.name }]}
          trailing={[{ key: "total", header: "Total", cell: (row) => row.total, numeric: true }]}
          totals={{ bands: { "100": 4, new: 10, repetition: 2 }, trailing: [16] }}
          beforeRows={{ label: "Paid at", bands: { "100": "30%" } }}
        />
      </IntlProvider>,
    );
    const table = screen.getByRole("table", { name: "Word counts" });
    const [header, paidAt, first, , total] = within(table).getAllByRole("row");
    expect(
      within(header)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Project",
      "Repetition",
      "100%",
      "95–99%",
      "85–94%",
      "75–84%",
      "50–74%",
      "New",
      "Total",
    ]);
    expect(paidAt.textContent).toContain("30%");
    expect(
      within(first)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Web app", "0", "4", "0", "0", "0", "0", "10", "14"]);
    expect(
      within(total)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Total", "2", "4", "0", "0", "0", "0", "10", "16"]);
  });
});
