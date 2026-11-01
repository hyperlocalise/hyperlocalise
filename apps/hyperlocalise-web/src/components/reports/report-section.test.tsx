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

import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";

import { ReportSectionState } from "./report-section";

function renderSection(query: { data?: string; isError: boolean; error?: unknown }) {
  render(
    <IntlProvider locale="en" messages={{}}>
      <ReportSectionState
        query={{ data: query.data, isPending: false, ...query, refetch: vi.fn() }}
      >
        {(data) => <p>{data}</p>}
      </ReportSectionState>
    </IntlProvider>,
  );
}

describe("ReportSectionState", () => {
  it("keeps what was loaded under a reload that failed, and says it may be old", () => {
    const error = new ApiResponseError("Busy", { code: "reports_busy", status: 503 });
    renderSection({ data: "Loaded figures", isError: true, error });
    expect(screen.getByText("Loaded figures")).toBeInTheDocument();
    expect(
      screen.getByText("These figures could not be refreshed, so they may be out of date."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps the figures when a 403 means go-svc's flag lookup failed", () => {
    const error = new ApiResponseError("x", { code: "feature_unavailable", status: 403 });
    renderSection({ data: "Loaded figures", isError: true, error });
    expect(screen.getByText("Loaded figures")).toBeInTheDocument();
  });

  it.each([403, 404])("takes the figures away when go-svc refuses a reload with %i", (status) => {
    const error = new ApiResponseError("No", { code: "report_costs_forbidden", status });
    renderSection({ data: "Loaded figures", isError: true, error });
    expect(screen.queryByText("Loaded figures")).not.toBeInTheDocument();
    expect(screen.getByText("This report could not be loaded.")).toBeInTheDocument();
  });

  it.each([
    ["reports_busy", "Reports is busy. Try again in a moment."],
    ["report_timed_out", "This took too long to load. Try again, or narrow the report's filters."],
    ["internal_error", "This report could not be loaded."],
  ])("says what it can about a first load that answered %s", (code, text) => {
    renderSection({ isError: true, error: new ApiResponseError("go-svc", { code, status: 503 }) });
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
