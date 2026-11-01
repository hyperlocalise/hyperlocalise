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
  it("keeps what was loaded under a reload that failed", () => {
    renderSection({ data: "Loaded figures", isError: true, error: new Error("Too slow") });
    expect(screen.getByText("Loaded figures")).toBeInTheDocument();
    expect(screen.getByText("Too slow")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says why a first load failed, or that it could not load", () => {
    renderSection({ isError: true, error: new Error("Choose fewer days") });
    expect(screen.getByText("Choose fewer days")).toBeInTheDocument();
  });

  it("falls back to its own message without an error to show", () => {
    renderSection({ isError: true });
    expect(screen.getByText("This report could not be loaded.")).toBeInTheDocument();
  });
});
