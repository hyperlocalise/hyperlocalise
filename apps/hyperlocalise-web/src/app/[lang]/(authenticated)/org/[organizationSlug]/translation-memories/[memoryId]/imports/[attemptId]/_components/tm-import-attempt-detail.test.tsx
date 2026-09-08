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
import { describe, expect, it } from "vite-plus/test";

import { TmImportDiagnosticList } from "./tm-import-attempt-detail";

describe("TmImportDiagnosticList", () => {
  it("renders a zero-based diagnostic unit index", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <TmImportDiagnosticList
          diagnostics={[
            {
              severity: "warning",
              code: "invalid_unit",
              message: "The first unit needs attention.",
              unitIndex: 0,
            },
          ]}
        />
      </IntlProvider>,
    );

    expect(screen.getByText("Unit 0")).toBeInTheDocument();
    expect(screen.getByText("The first unit needs attention.")).toBeInTheDocument();
  });
});
